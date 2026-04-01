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

export class LlmInvoker implements IInvoker {
  private readonly anthropic: AnthropicClient;
  private readonly configForgeClient: ConfigForgeClient;

  constructor(anthropic: AnthropicClient, configForgeClient: ConfigForgeClient) {
    this.anthropic = anthropic;
    this.configForgeClient = configForgeClient;
  }

  async invoke(
    skill: SkillDocument,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    if (skill.execution.mode !== 'llm') {
      throw new Error(`LlmInvoker cannot handle skill with mode "${skill.execution.mode}"`);
    }

    const execution = skill.execution as LlmExecution;
    const llmConfig = await this.configForgeClient.getLlmConfig(execution.config_ref, signal);

    const prompt = this.buildPrompt(skill, args);

    const { data } = llmConfig;
    const message = await this.anthropic.messages.create(
      {
        model: data.model,
        max_tokens: data.max_tokens,
        ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    );

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error(`LLM skill "${skill.name}" returned non-text content`);
    }

    const primaryKind = skill.produces_kinds[0] ?? 'cam.unknown';

    return [
      {
        kind: primaryKind,
        data: { text: content.text },
        skill_name: skill.name,
        step_index: 0,
      },
    ];
  }

  private buildPrompt(skill: SkillDocument, args: Record<string, unknown>): string {
    const lines: string[] = [
      `Skill: ${skill.name}`,
      `Description: ${skill.description}`,
    ];

    if (Object.keys(args).length > 0) {
      lines.push(`Inputs: ${JSON.stringify(args, null, 2)}`);
    }

    if (skill.skill_md_body) {
      lines.push('', '---', skill.skill_md_body);
    }

    return lines.join('\n');
  }
}
