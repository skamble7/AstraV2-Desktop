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
 *
 * Protocol detection (automatic, from response shape):
 * - Async job polling: response has { job_id, status: "queued"|"running" }
 *   → calls a sibling `.status` tool (tool_name with `.start` → `.status`) until done
 * - Pagination: response has { next_cursor: "..." }
 *   → calls same tool repeatedly with cursor until next_cursor is absent
 *   → merges all `artifacts` arrays across pages
 * - Multi-artifact envelope: unwrapped JSON has top-level `artifacts` array
 *   → returns one StagedArtifact per array element (each has its own kind_id)
 */

import type { AnthropicClient } from '../types/agent.types.js';
import type { IInvoker } from './IInvoker.js';
import type { SkillDocument, McpExecution, StagedArtifact } from '../types/skill.types.js';
import type { McpSessionPool } from '../mcp/McpSessionPool.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

type McpClient = import('@modelcontextprotocol/sdk/client/index.js').Client;

/** Minimum polling timeout for async jobs — even if skill timeout_sec is small. */
const ASYNC_JOB_MIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_INITIAL_MS = 3_000;
const POLL_INTERVAL_MAX_MS = 10_000;

export class McpInvoker implements IInvoker {
  /**
   * Cache: sessionId → (skillName → discovered tool schema JSON string)
   */
  private readonly schemaCache = new Map<string, Map<string, string>>();
  /**
   * Cache: sessionId → (skillName → full tool list for the MCP server)
   * Used to look up sibling `.status` tools for async job polling.
   */
  private readonly toolListCache = new Map<string, Map<string, Tool[]>>();
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

    // Discover and cache the tool schema (also caches the full tool list)
    const toolSchema = await this.discoverToolSchema(client, skill, signal);

    // Validate args and attempt LLM repair if needed
    const validatedArgs = await this.validateAndRepairArgs(skill, mcpArgs, toolSchema, signal);

    // Invoke with protocol detection (polling / pagination)
    const unwrapped = await this.invokeWithProtocol(client, skill, validatedArgs, execution, signal);

    return this.buildArtifacts(unwrapped, skill);
  }

  /**
   * Orchestrates the full protocol:
   * 1. Call the tool via invokeWithRetry
   * 2. Unwrap MCP content envelope
   * 3. Detect async job → poll to completion
   * 4. Detect pagination → fetch all pages
   */
  private async invokeWithProtocol(
    client: McpClient,
    skill: SkillDocument,
    args: Record<string, unknown>,
    execution: McpExecution,
    signal: AbortSignal
  ): Promise<unknown> {
    const rawResult = await this.invokeWithRetry(client, execution.tool_name, args, execution, signal);
    let unwrapped = this.unwrapMcpEnvelope(rawResult, skill);

    // ── Async job detection ────────────────────────────────────────────────
    if (this.isJobResponse(unwrapped)) {
      const job = unwrapped as Record<string, unknown>;
      const jobId = job['job_id'] as string;
      const statusToolName = this.findStatusTool(execution.tool_name, skill);
      if (!statusToolName) {
        throw new Error(
          `[McpInvoker] "${skill.name}" returned a job response (job_id=${jobId}) but no ".status" sibling tool was found. Cannot poll for completion.`
        );
      }
      const timeoutMs = Math.max((execution.timeout_sec ?? 30) * 1000, ASYNC_JOB_MIN_TIMEOUT_MS);
      console.log(`[McpInvoker] "${skill.name}" async job detected — job_id=${jobId}, polling ${statusToolName} (timeout ${timeoutMs / 1000}s)`);
      unwrapped = await this.pollJobToCompletion(client, statusToolName, jobId, execution, signal, timeoutMs);
    }

    // ── Pagination detection ───────────────────────────────────────────────
    if (this.hasCursor(unwrapped)) {
      console.log(`[McpInvoker] "${skill.name}" paginated response detected — fetching all pages`);
      unwrapped = await this.fetchAllPages(client, execution.tool_name, unwrapped as Record<string, unknown>, args, execution, signal);
    }

    return unwrapped;
  }

  /**
   * Unwraps the MCP content envelope: { content: [{ type: 'text', text: '...' }] }
   * Throws on isError: true.
   * Falls through to raw result if not an envelope shape.
   */
  private unwrapMcpEnvelope(result: unknown, skill: SkillDocument): unknown {
    if (result === null || typeof result !== 'object') return result;
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

    const content = r['content'];
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0] as Record<string, unknown>;
      if (first['type'] === 'text' && typeof first['text'] === 'string') {
        try {
          return JSON.parse(first['text']);
        } catch {
          return first['text'];
        }
      }
    }

    return result;
  }

  /** Returns true if the unwrapped result looks like an async job response. */
  private isJobResponse(data: unknown): boolean {
    if (data === null || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d['job_id'] === 'string' &&
      (d['status'] === 'queued' || d['status'] === 'running')
    );
  }

  /** Returns true if the unwrapped result has a pagination cursor. */
  private hasCursor(data: unknown): boolean {
    if (data === null || typeof data !== 'object') return false;
    return typeof (data as Record<string, unknown>)['next_cursor'] === 'string';
  }

  /**
   * Finds the sibling `.status` tool name for a `.start` tool.
   * Looks up the cached tool list for this session/skill pair.
   */
  private findStatusTool(toolName: string, skill: SkillDocument): string | null {
    if (!toolName.endsWith('.start')) return null;
    const statusName = toolName.slice(0, -'.start'.length) + '.status';
    const sessionTools = this.toolListCache.get(this.sessionId);
    const tools = sessionTools?.get(skill.name) ?? [];
    return tools.find((t) => t.name === statusName) ? statusName : null;
  }

  /**
   * Polls the `.status` tool until the job reaches `"done"` or `"error"`.
   * Uses exponential backoff between polls, bounded by POLL_INTERVAL_MAX_MS.
   */
  private async pollJobToCompletion(
    client: McpClient,
    statusToolName: string,
    jobId: string,
    execution: McpExecution,
    signal: AbortSignal,
    timeoutMs: number
  ): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;
    let pollInterval = POLL_INTERVAL_INITIAL_MS;

    while (Date.now() < deadline) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      await this.sleep(pollInterval, signal);
      pollInterval = Math.min(pollInterval * 1.5, POLL_INTERVAL_MAX_MS);

      const rawPoll = await this.invokeWithRetry(client, statusToolName, { job_id: jobId }, execution, signal);
      // Re-use a dummy skill for envelope unwrapping error messages
      const pollData = this.unwrapMcpEnvelopeRaw(rawPoll);

      if (pollData === null || typeof pollData !== 'object') continue;
      const d = pollData as Record<string, unknown>;

      const status = d['status'];
      const progress = d['progress'];
      const message = d['message'];
      console.log(`[McpInvoker] polling job_id=${jobId} — status=${String(status)} progress=${String(progress)} ${message ? `(${String(message)})` : ''}`);

      if (status === 'done') {
        console.log(`[McpInvoker] job_id=${jobId} completed`);
        return pollData;
      }

      if (status === 'error') {
        const errorMsg = typeof d['error'] === 'string' ? d['error'] : String(d['message'] ?? 'unknown error');
        throw new Error(`[McpInvoker] async job failed: ${errorMsg}`);
      }
    }

    throw new Error(`[McpInvoker] async job timed out after ${timeoutMs / 1000}s (job_id=${jobId})`);
  }

  /**
   * Fetches all pages of a paginated response, merging `artifacts` arrays.
   * Uses `run_id` from the first page (if present) for subsequent calls so the
   * server can serve from its cache.
   */
  private async fetchAllPages(
    client: McpClient,
    toolName: string,
    firstPage: Record<string, unknown>,
    originalArgs: Record<string, unknown>,
    execution: McpExecution,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const allArtifacts: unknown[] = Array.isArray(firstPage['artifacts'])
      ? [...(firstPage['artifacts'] as unknown[])]
      : [];

    // Carry run_id forward so the server can serve subsequent pages from cache
    const runId = (firstPage['run'] as Record<string, unknown> | undefined)?.['run_id'];
    let cursor = firstPage['next_cursor'] as string | undefined;
    let page = 1;

    while (cursor) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const pageArgs: Record<string, unknown> = {
        ...originalArgs,
        cursor,
        ...(runId ? { run_id: runId } : {}),
      };

      const rawPage = await this.invokeWithRetry(client, toolName, pageArgs, execution, signal);
      const pageData = this.unwrapMcpEnvelopeRaw(rawPage);

      if (pageData !== null && typeof pageData === 'object') {
        const pd = pageData as Record<string, unknown>;
        if (Array.isArray(pd['artifacts'])) {
          allArtifacts.push(...(pd['artifacts'] as unknown[]));
        }
        cursor = typeof pd['next_cursor'] === 'string' ? pd['next_cursor'] : undefined;
      } else {
        cursor = undefined;
      }

      page++;
      console.log(`[McpInvoker] paginated — fetched page ${page}, total artifacts so far: ${allArtifacts.length}`);
    }

    console.log(`[McpInvoker] pagination complete — ${allArtifacts.length} artifacts across ${page} page(s)`);
    return { ...firstPage, artifacts: allArtifacts, next_cursor: undefined };
  }

  /**
   * Unwraps MCP content envelope without skill context (used internally for poll/page calls).
   */
  private unwrapMcpEnvelopeRaw(result: unknown): unknown {
    if (result === null || typeof result !== 'object') return result;
    const r = result as Record<string, unknown>;
    if (r['isError'] === true) {
      const content = r['content'];
      let errorText = 'MCP tool returned an error.';
      if (Array.isArray(content)) {
        const tb = content.find(
          (c): c is { type: string; text: string } =>
            c !== null && typeof c === 'object' && (c as Record<string, unknown>)['type'] === 'text'
        );
        if (tb) errorText = tb.text;
      }
      throw new Error(errorText);
    }
    const content = r['content'];
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0] as Record<string, unknown>;
      if (first['type'] === 'text' && typeof first['text'] === 'string') {
        try { return JSON.parse(first['text']); } catch { return first['text']; }
      }
    }
    return result;
  }

  /**
   * Converts the final unwrapped data into StagedArtifact[].
   *
   * Two shapes handled:
   *  1. Top-level `artifacts` array (COBOL/guidance protocol) — one StagedArtifact per element
   *  2. Everything else — single StagedArtifact using skill.produces_kinds[0]
   */
  private buildArtifacts(data: unknown, skill: SkillDocument): StagedArtifact[] {
    const primaryKind = skill.produces_kinds?.[0] ?? 'cam.unknown';

    // ── Multi-artifact envelope ────────────────────────────────────────────
    if (data !== null && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d['artifacts']) && (d['artifacts'] as unknown[]).length > 0) {
        return (d['artifacts'] as Record<string, unknown>[]).map((a) => {
          const kind = typeof a['kind_id'] === 'string' ? a['kind_id'] : primaryKind;
          return {
            kind,
            name: typeof a['name'] === 'string' ? a['name'] : this.deriveNameFromKind(kind),
            data: a['data'] ?? a,
            skill_name: skill.name,
            step_index: 0,
          };
        });
      }
    }

    // ── Single artifact (existing behaviour) ──────────────────────────────
    const name = this.deriveNameFromKind(primaryKind);
    return [
      {
        kind: primaryKind,
        name,
        data,
        skill_name: skill.name,
        step_index: 0,
      },
    ];
  }

  /** Derives a human-readable name from a kind: cam.asset.raina_input → "Raina Input" */
  private deriveNameFromKind(kind: string): string {
    const parts = kind.split('.');
    return parts.length >= 3
      ? parts.slice(2).join(' ').replace(/_/g, ' ')
          .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : kind;
  }

  private async discoverToolSchema(
    client: McpClient,
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

    // Cache the full tool list for sibling-tool lookup (async job status tool)
    const sessionToolLists = this.toolListCache.get(this.sessionId) ?? new Map<string, Tool[]>();
    sessionToolLists.set(skill.name, toolsResult.tools);
    this.toolListCache.set(this.sessionId, sessionToolLists);

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
    client: McpClient,
    toolName: string,
    args: Record<string, unknown>,
    execution: McpExecution,
    signal: AbortSignal
  ): Promise<unknown> {
    const maxAttempts = execution.retry?.max_attempts ?? 1;
    const backoffMs = execution.retry?.backoff_ms ?? 500;
    const jitterMs = execution.retry?.jitter_ms ?? 100;
    // Use skill timeout_sec for the MCP SDK per-call timeout.
    // Default 60s; increase when the skill declares a longer timeout.
    const callTimeoutMs = (execution.timeout_sec ?? 60) * 1000;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const result = await client.callTool(
          { name: toolName, arguments: args },
          undefined,
          { timeout: callTimeoutMs }
        );
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
