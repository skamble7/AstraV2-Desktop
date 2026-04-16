/**
 * LlmInvoker — invokes LLM-mode skills via the Anthropic API + ConfigForge.
 *
 * LLM-mode skills do not call an MCP server. Instead, they call Claude directly
 * using a ConfigForge LLM configuration reference. The skill's description and
 * parameters are used to construct the prompt.
 */

import type { AnthropicClient } from '../types/agent.types.js';
import type { IInvoker } from './IInvoker.js';
import type { SkillDocument, LlmExecution, StagedArtifact } from '../types/skill.types.js';
import type { ConfigForgeClient } from '../http/clients/ConfigForgeClient.js';
import type { ArtifactRegistryClient } from '../http/clients/ArtifactRegistryClient.js';

export class LlmInvoker implements IInvoker {
  private readonly anthropic: AnthropicClient;
  private readonly configForgeClient: ConfigForgeClient;
  private readonly artifactRegistryClient: ArtifactRegistryClient;
  /** Fallback model used when the skill's config_ref is absent or empty. */
  private readonly plannerModel: string;

  constructor(
    anthropic: AnthropicClient,
    configForgeClient: ConfigForgeClient,
    plannerModel: string,
    artifactRegistryClient: ArtifactRegistryClient
  ) {
    this.anthropic = anthropic;
    this.configForgeClient = configForgeClient;
    this.plannerModel = plannerModel;
    this.artifactRegistryClient = artifactRegistryClient;
  }

  async invoke(
    skill: SkillDocument,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    if (!skill.execution || skill.execution.mode !== 'llm') {
      throw new Error(`LlmInvoker cannot handle skill "${skill.name}" — execution mode is not 'llm'.`);
    }

    const execution = skill.execution as LlmExecution;

    // Fetch kind schema to guide output shape — best-effort, never fatal
    const primaryKindForSchema = skill.produces_kinds?.[0];
    let kindSchema: Record<string, unknown> | undefined;
    if (primaryKindForSchema) {
      const kindDef = await this.artifactRegistryClient.getKind(primaryKindForSchema, signal);
      if (kindDef && kindDef.schema_versions.length > 0) {
        // Use the latest schema version
        const latest = kindDef.schema_versions[kindDef.schema_versions.length - 1];
        kindSchema = latest.json_schema;
        console.log(`[LlmInvoker] "${skill.name}" → fetched kind schema for ${primaryKindForSchema}, keys: ${Object.keys(kindSchema).join(', ')}`);
      } else {
        console.warn(`[LlmInvoker] "${skill.name}" → no kind schema found for ${primaryKindForSchema}, proceeding without`);
      }
    }

    const prompt = this.buildPrompt(skill, args, kindSchema);

    let model = this.plannerModel;
    let maxTokens = 8096;
    let temperature: number | undefined;

    if (execution.config_ref) {
      const llmConfig = await this.configForgeClient.getLlmConfig(execution.config_ref, signal);
      if (['bedrock', 'anthropic'].includes(llmConfig.data.provider)) {
        model = llmConfig.data.model;
        maxTokens = llmConfig.data.max_tokens;
        temperature = llmConfig.data.temperature;
      } else {
        console.warn(`[LlmInvoker] "${skill.name}" → config_ref "${execution.config_ref}" uses provider "${llmConfig.data.provider}" — not compatible with current client, using planner model`);
      }
    }

    const stream = this.anthropic.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    );

    const message = await stream.finalMessage();
    const content = message.content[0];
    if (!content || content.type !== 'text') {
      throw new Error(`LLM skill "${skill.name}" returned non-text content`);
    }

    const primaryKind = skill.produces_kinds?.[0] ?? 'cam.unknown';
    const kindParts = primaryKind.split('.');
    const name = kindParts.length >= 3
      ? kindParts.slice(2).join(' ').replace(/_/g, ' ')
          .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : primaryKind;

    // Try to parse the LLM response as structured JSON so it passes kind schema validation.
    // Strip markdown code fences the LLM sometimes wraps output in.
    const raw = content.text
      .replace(/^```(?:json|yaml)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let artifactData: unknown;
    try {
      artifactData = JSON.parse(raw);
      console.log(`[LlmInvoker] "${skill.name}" → parsed as JSON (${primaryKind}), top-level keys: ${Object.keys(artifactData as object).join(', ')}`);
    } catch {
      // Not JSON — store as a plain text object so the field is at least named
      console.warn(`[LlmInvoker] "${skill.name}" → response is not JSON, storing as { text }. First 200 chars: ${raw.slice(0, 200)}`);
      artifactData = { text: content.text };
    }

    return [
      {
        kind: primaryKind,
        name,
        data: artifactData,
        skill_name: skill.name,
        step_index: 0,
      },
    ];
  }

  private buildPrompt(skill: SkillDocument, args: Record<string, unknown>, kindSchema?: Record<string, unknown>): string {
    const lines: string[] = [
      `Skill: ${skill.name}`,
      `Description: ${skill.description}`,
    ];

    // Extract artifact context (injected by ExecutionCore) and filter it from visible args
    const artifactContext = args['_artifact_context'] as Record<string, unknown> | undefined;
    const visibleArgs = Object.fromEntries(
      Object.entries(args).filter(([k]) => k !== '_artifact_context')
    );

    if (Object.keys(visibleArgs).length > 0) {
      lines.push(`Inputs: ${JSON.stringify(visibleArgs, null, 2)}`);
    }

    // Inject artifacts produced by prior steps as grounded context
    if (artifactContext && Object.keys(artifactContext).length > 0) {
      lines.push('', '## Artifacts produced by prior steps in this run (use these as your primary inputs)');
      for (const [kind, data] of Object.entries(artifactContext)) {
        lines.push(`\n### ${kind}`);
        lines.push('```json');
        lines.push(JSON.stringify(data, null, 2));
        lines.push('```');
      }
    }

    if (skill.skill_md_body) {
      lines.push('', '---', skill.skill_md_body);
    }

    lines.push('', '---', '## Output format');
    if (kindSchema) {
      lines.push(
        'Your output MUST be a valid JSON object that conforms exactly to the following JSON Schema:',
        '```json',
        JSON.stringify(kindSchema, null, 2),
        '```',
        'Return ONLY the JSON object. Do NOT wrap in markdown fences. Do NOT add explanation. Output raw JSON only.'
      );
    } else {
      lines.push(
        'Return ONLY a valid JSON object matching the output structure described above.',
        'Do NOT wrap in markdown fences. Do NOT add explanation. Output raw JSON only.'
      );
    }

    return lines.join('\n');
  }
}
