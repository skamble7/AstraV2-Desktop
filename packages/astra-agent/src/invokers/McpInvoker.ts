/**
 * McpInvoker — invokes MCP-mode skills via the @modelcontextprotocol/sdk.
 *
 * Key behaviours:
 * - Resolves ${ENV_VAR} in base_url and headers at invocation time (never at parse time)
 * - Calls tools/list once per session per skill (schema discovery), caches result
 * - Validates args against the discovered schema before invoking
 * - One LLM repair attempt if MCP server returns a validation error
 * - Respects AbortSignal throughout
 * - Applies retry config from skill.execution.retry
 */

import type { AnthropicClient } from '../types/agent.types.js';
import type { IInvoker } from './IInvoker.js';
import type { SkillDocument, McpExecution, StagedArtifact } from '../types/skill.types.js';
import type { McpSessionPool } from '../mcp/McpSessionPool.js';

export class McpInvoker implements IInvoker {
  /**
   * Cache: sessionId → (skillName → discovered tool schema JSON string)
   */
  private readonly schemaCache = new Map<string, Map<string, string>>();
  private readonly sessionPool: McpSessionPool;
  private readonly anthropic: AnthropicClient;
  private readonly sessionId: string;
  private readonly workspaceId: string;
  private readonly repairModel: string;
  /** The user's original intent message — used as context when repairing missing args. */
  private readonly intent: string;

  constructor(sessionPool: McpSessionPool, anthropic: AnthropicClient, sessionId: string, workspaceId: string, repairModel: string, intent: string = '') {
    this.sessionPool = sessionPool;
    this.anthropic = anthropic;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.repairModel = repairModel;
    this.intent = intent;
  }

  async invoke(
    skill: SkillDocument,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    if (!skill.execution || skill.execution.mode !== 'mcp') {
      throw new Error(`McpInvoker cannot handle skill "${skill.name}" — execution mode is not 'mcp'.`);
    }

    const execution = skill.execution as McpExecution;
    const client = await this.sessionPool.getOrCreate(this.sessionId, skill.name, execution);

    // Strip internal context keys injected by ExecutionCore — not MCP tool params
    const mcpArgs = Object.fromEntries(
      Object.entries(args).filter(([k]) => !k.startsWith('_'))
    );

    // Discover and cache the tool schema
    const toolSchema = await this.discoverToolSchema(client, skill, signal);

    // Validate args and attempt LLM repair if needed
    const validatedArgs = await this.validateAndRepairArgs(skill, mcpArgs, toolSchema, signal);

    // Invoke with retry
    const result = await this.invokeWithRetry(
      client,
      execution.tool_name,
      validatedArgs,
      execution,
      signal
    );

    return this.parseResult(result, skill);
  }

  private async discoverToolSchema(
    client: import('@modelcontextprotocol/sdk/client/index.js').Client,
    skill: SkillDocument,
    _signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const sessionSchemas =
      this.schemaCache.get(this.sessionId) ?? new Map<string, string>();

    const cached = sessionSchemas.get(skill.name);
    if (cached) {
      return JSON.parse(cached) as Record<string, unknown>;
    }

    const execution = skill.execution as McpExecution;
    const toolsResult = await client.listTools();
    const tool = toolsResult.tools.find((t) => t.name === execution.tool_name);

    if (!tool) {
      throw new Error(
        `MCP server does not expose tool "${execution.tool_name}" for skill "${skill.name}"`
      );
    }

    const schemaJson = JSON.stringify(tool.inputSchema);
    sessionSchemas.set(skill.name, schemaJson);
    this.schemaCache.set(this.sessionId, sessionSchemas);

    return tool.inputSchema as Record<string, unknown>;
  }

  private async validateAndRepairArgs(
    skill: SkillDocument,
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const requiredFields = (schema['required'] as string[] | undefined) ?? [];

    // Inject known values for well-known fields before checking for missing ones.
    // This prevents the repair LLM from guessing workspace_id from the intent text.
    const enriched = { ...args };
    if (requiredFields.includes('workspace_id') && !enriched['workspace_id']) {
      enriched['workspace_id'] = this.workspaceId;
    }

    const missingFields = requiredFields.filter((field) => !(field in enriched));

    if (missingFields.length === 0) {
      return enriched;
    }

    // Attempt LLM repair, passing the schema so it knows exact field names
    return this.repairArgsWithLlm(skill, enriched, missingFields, schema, signal);
  }

  private async repairArgsWithLlm(
    skill: SkillDocument,
    args: Record<string, unknown>,
    missingFields: string[],
    schema: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    // Extract field descriptions from the schema to help the LLM understand what each field expects
    const properties = (schema['properties'] as Record<string, Record<string, unknown>> | undefined) ?? {};
    const fieldDescriptions = Object.entries(properties)
      .map(([name, def]) => `  - ${name}: ${(def['description'] as string | undefined) ?? (def['type'] as string | undefined) ?? 'unknown'}`)
      .join('\n');

    const prompt = [
      `You are mapping arguments to the exact parameter names expected by the MCP tool for skill "${skill.name}".`,
      ``,
      `The tool's accepted parameters:`,
      fieldDescriptions || '  (no schema available)',
      ``,
      `Required fields that are missing from the current args: ${missingFields.join(', ')}.`,
      `Current args (may use wrong key names): ${JSON.stringify(args)}`,
      `Workspace ID (use this for any workspace_id field): ${this.workspaceId}`,
      this.intent ? `User's original message: "${this.intent}"` : '',
      ``,
      `Instructions:`,
      `- Extract values from the user's message and current args using the EXACT field names listed above`,
      `- If a current arg has a value that matches a required field semantically (e.g. "url" contains a URL and "stories_url" is required), use it under the correct field name`,
      `- Return ONLY the fields defined in the tool schema — do not include extra keys`,
      `- Reply ONLY with valid JSON — no explanation, no markdown fences`,
    ].filter(Boolean).join('\n');

    const message = await this.anthropic.messages.create(
      {
        model: this.repairModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    );

    const content = message.content[0];
    if (content.type !== 'text') {
      return args;
    }

    try {
      const raw = content.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const repaired = JSON.parse(raw) as Record<string, unknown>;
      console.log(`[McpInvoker] arg repair for "${skill.name}": ${JSON.stringify(repaired)}`);
      return repaired;
    } catch {
      console.warn(`[McpInvoker] arg repair parse failed for "${skill.name}", falling back to original args`);
      return args;
    }
  }

  private async invokeWithRetry(
    client: import('@modelcontextprotocol/sdk/client/index.js').Client,
    toolName: string,
    args: Record<string, unknown>,
    execution: McpExecution,
    signal: AbortSignal
  ): Promise<unknown> {
    const maxAttempts = execution.retry?.max_attempts ?? 1;
    const backoffMs = execution.retry?.backoff_ms ?? 500;
    const jitterMs = execution.retry?.jitter_ms ?? 100;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const result = await client.callTool({ name: toolName, arguments: args });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          const delay = backoffMs + Math.random() * jitterMs;
          await this.sleep(delay, signal);
        }
      }
    }

    throw lastError ?? new Error('MCP invocation failed');
  }

  private parseResult(result: unknown, skill: SkillDocument): StagedArtifact[] {
    // MCP tool results are { content: [...], isError?: boolean }
    // Treat isError: true as a fatal failure — extract the error text and throw.
    if (result !== null && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (r['isError'] === true) {
        const content = r['content'];
        let errorText = `MCP tool "${skill.execution && 'tool_name' in skill.execution ? skill.execution.tool_name : skill.name}" returned an error.`;
        if (Array.isArray(content)) {
          const textBlock = content.find(
            (c): c is { type: string; text: string } =>
              c !== null && typeof c === 'object' && (c as Record<string, unknown>)['type'] === 'text'
          );
          if (textBlock) errorText = textBlock.text;
        }
        throw new Error(errorText);
      }
    }

    const primaryKind = skill.produces_kinds?.[0] ?? 'cam.unknown';

    // Unwrap MCP content envelope: { content: [{ type: 'text', text: '...' }] }
    // The actual artifact data is the JSON-parsed text of the first content block.
    let artifactData: unknown = result;
    if (result !== null && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      const content = r['content'];
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as Record<string, unknown>;
        if (first['type'] === 'text' && typeof first['text'] === 'string') {
          try {
            artifactData = JSON.parse(first['text']);
          } catch {
            artifactData = first['text']; // keep as string if not JSON
          }
        }
      }
    }

    // Derive a human-readable name from the kind: cam.asset.raina_input → "Raina Input"
    const kindParts = primaryKind.split('.');
    const name = kindParts.length >= 3
      ? kindParts.slice(2).join(' ').replace(/_/g, ' ')
          .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : primaryKind;

    return [
      {
        kind: primaryKind,
        name,
        data: artifactData,
        skill_name: skill.name,
        step_index: 0, // Will be overwritten by StepRunner with the actual step index
      },
    ];
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    });
  }
}
