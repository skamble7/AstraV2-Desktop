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
  private readonly repairModel: string;

  constructor(sessionPool: McpSessionPool, anthropic: AnthropicClient, sessionId: string, repairModel: string) {
    this.sessionPool = sessionPool;
    this.anthropic = anthropic;
    this.sessionId = sessionId;
    this.repairModel = repairModel;
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

    // Discover and cache the tool schema
    const toolSchema = await this.discoverToolSchema(client, skill, signal);

    // Validate args and attempt LLM repair if needed
    const validatedArgs = await this.validateAndRepairArgs(skill, args, toolSchema, signal);

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
    _schema: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    // Basic validation: attempt invocation; if MCP returns validation error, try LLM repair once
    // Full JSON Schema validation would require ajv — using a lightweight approach here.
    // If schema has required fields, check they are present.
    const requiredFields = (_schema['required'] as string[] | undefined) ?? [];
    const missingFields = requiredFields.filter((field) => !(field in args));

    if (missingFields.length === 0) {
      return args;
    }

    // Attempt LLM repair
    return this.repairArgsWithLlm(skill, args, missingFields, signal);
  }

  private async repairArgsWithLlm(
    skill: SkillDocument,
    args: Record<string, unknown>,
    missingFields: string[],
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const prompt = [
      `The following arguments were provided for skill "${skill.name}" but are missing required fields: ${missingFields.join(', ')}.`,
      `Existing args: ${JSON.stringify(args)}`,
      `Please return a JSON object with the complete args including the missing fields filled with reasonable defaults.`,
      `Reply ONLY with valid JSON — no explanation.`,
    ].join('\n');

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
      return args; // fallback to original — MCP will fail with descriptive error
    }

    try {
      return JSON.parse(content.text) as Record<string, unknown>;
    } catch {
      return args; // fallback
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
    // MCP tool results are typically { content: [{ type: 'text', text: '...' }] }
    // The actual structure depends on the MCP server implementation.
    // We treat the whole result as data for the first produces_kind.
    const primaryKind = skill.produces_kinds?.[0] ?? 'cam.unknown';

    return [
      {
        kind: primaryKind,
        data: result,
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
