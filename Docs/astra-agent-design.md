# Astra Agent — TypeScript Design

**Branch:** `feature/skill-based-architecture`  
**Status:** Accepted  
**Last Updated:** March 2026

---

## Table of Contents

1. [Position and Responsibilities](#1-position-and-responsibilities)
2. [Module Structure](#2-module-structure)
3. [Entry Point — AgentController](#3-entry-point--agentcontroller)
4. [Two Strategies, One Execution Core](#4-two-strategies-one-execution-core)
5. [System Prompt Design](#5-system-prompt-design)
6. [ExecutionCore — The Step Loop](#6-executioncore--the-step-loop)
7. [McpInvoker](#7-mcpinvoker)
8. [ask_user Tool](#8-ask_user-tool)
9. [invoke_skill_pack Tool](#9-invoke_skill_pack-tool)
10. [Streaming](#10-streaming)
11. [Session Management](#11-session-management)
12. [Multi-Workspace Isolation](#12-multi-workspace-isolation)
13. [Electron App Stack](#13-electron-app-stack)
14. [Open Questions — Resolved](#14-open-questions--resolved)
15. [ADR Cross-Reference](#15-adr-cross-reference)

---

## 1. Position and Responsibilities

The Astra Agent is a TypeScript module running in the **Electron main process**. It is the sole orchestrator for all skill-based work — it replaces what Python's `planner-service` and `conductor-service` do for capabilities. It never touches `cap.*` identifiers, `capability-service`, or any Python backend agent.

Its responsibilities are:

- Receive a user intent or a skill pack selection from the renderer via IPC
- Produce a plan — via LLM reasoning (intent strategy) or by reading a pack playbook (pack strategy)
- Execute the plan step by step: resolve skills, invoke MCP tools or LLM, collect artifacts, run enrichment
- Stream tokens and status events back to the renderer in real time
- Persist conversation history to `session-svc` after each turn
- Record run state to `learning-service` throughout execution
- Support mid-run user input via an `ask_user` tool
- Cancel individual runs per workspace without affecting other workspaces

---

## 2. Module Structure

```
electron/src/agent/
├── index.ts                    ← public entry: AgentController
├── strategies/
│   ├── IntentStrategy.ts       ← LLM-driven skill selection + plan building
│   └── PackStrategy.ts         ← deterministic plan from sk pack playbook
├── core/
│   ├── ExecutionCore.ts        ← plan → step loop, phase orchestration
│   ├── SkillResolver.ts        ← resolves sk.* names to SkillDocument + MCP config
│   ├── McpInvoker.ts           ← connects to MCP server, calls tool, handles retries
│   ├── LlmInvoker.ts           ← executes LLM-mode skills via ConfigForge ref
│   ├── EnrichmentPhase.ts      ← diagram + narrative enrichment post each step
│   ├── ArtifactPersister.ts    ← batch-upserts to workspace-manager-service
│   ├── RunRecorder.ts          ← creates/updates PlaybookRun in learning-service
│   └── Streamer.ts             ← token + event fan-out to renderer via IPC
├── session/
│   └── SessionManager.ts       ← load/save AnthropicMessages to session-svc
├── tools/
│   ├── registry.ts             ← builds Anthropic tool definitions from SkillDocuments
│   ├── invoke_skill_pack.ts    ← tool: execute a named skill pack by playbook
│   └── ask_user.ts             ← tool: suspend execution, request renderer input
└── types.ts                    ← shared agent types
```

---

## 3. Entry Point — AgentController

```typescript
class AgentController {
  // One controller per workspace. Created lazily when a workspace opens.
  private workspaceId: string;
  private abortController: AbortController | null = null;

  async startIntentRun(intent: string, sessionId: string): Promise<void>
  async startPackRun(packKey: string, packVersion: string, inputs: Record<string, unknown>, sessionId: string): Promise<void>
  async cancel(): Promise<void>
  async provideUserInput(token: string, value: unknown): Promise<void>
}
```

The main process holds a `Map<workspaceId, AgentController>`. Each workspace gets its own controller and its own `AbortController`. Cancelling one workspace's run has zero effect on any other.

---

## 4. Two Strategies, One Execution Core

Both strategies produce the same `Plan` type. `ExecutionCore` is blind to how the plan was made.

### IntentStrategy

Invoked when the user types a natural-language intent. Steps:

1. Loads the full skill manifest from `skill-registry-service` (all `published` skills, cached in memory, TTL 5 min).
2. Converts each `SkillDocument` into an Anthropic tool definition using `tools/registry.ts` — the tool name is the `sk.*` identifier, the description is the skill's `description` field, and the input schema is the skill's `parameters_schema` (not the MCP tool's schema — that is resolved at execution time).
3. Also registers two meta-tools: `invoke_skill_pack` and `ask_user`.
4. Calls `anthropic.messages.stream()` with the full conversation history, the system prompt (see §5), the user message, and the tool definitions.
5. As Claude returns `tool_use` blocks, each represents a skill the agent has decided to invoke. These are collected into an ordered `Plan` — a list of `PlanStep` objects.
6. The plan is streamed to the renderer progressively as steps are decided, not batch-returned after the full response.

### PackStrategy

Invoked when the user selects a skill pack and clicks Run. Steps:

1. Fetches the `SkillPackDocument` from `skill-registry-service`.
2. Reads `playbook.steps` directly — no Claude call, no LLM.
3. Converts each step into a `PlanStep` with the step's `skill_id` and any declared `parameters`.
4. Hands the plan to `ExecutionCore` immediately.

---

## 5. System Prompt Design

The intent strategy system prompt is the most important design decision in the agent. Its job is to make Claude an expert orchestrator of `sk.*` skills.

```
You are the Astra Agent — an intelligent orchestrator for a knowledge-generation platform.
Your role is to understand the user's intent and invoke the right sequence of skills to achieve it.

SKILLS
You have access to a set of registered skills (sk.* tools). Each skill:
- Executes exactly one MCP tool and produces one family of artifact kinds
- Has a detailed description explaining WHEN to use it, not just what it does
- May depend on artifacts produced by earlier skills

PLANNING BEHAVIOUR
- Think step by step about what the user wants to produce
- Select only the skills needed — do not invoke skills that are not required
- Respect dependency order: never invoke a skill before its depends_on skills have run
- If inputs are missing, use ask_user to request them before invoking skills
- If you would invoke the same skill pack as a whole, use invoke_skill_pack instead

EXECUTION BEHAVIOUR
- Invoke skills one at a time; wait for each to complete before proceeding
- After each skill, describe briefly what was produced and whether it succeeded
- If a skill fails, explain why and suggest whether to retry or stop

CONSTRAINTS
- Never guess MCP tool input schemas — they are resolved at runtime
- Never hallucinate artifact content — you orchestrate, you do not generate
- Current workspace: {workspaceId}
- Current session: {sessionId}
```

---

## 6. ExecutionCore — The Step Loop

```typescript
async function executeStep(step: PlanStep, state: RunState): Promise<StepResult>
```

Each step goes through three phases — identical to the Python conductor's three-phase model:

### Phase 1 — discover

Invoke the skill. For MCP skills this means `McpInvoker`; for LLM skills this means `LlmInvoker`. The result is a set of `StagedArtifact` objects. A discovery failure terminates the run immediately — `RunRecorder` marks the run `failed` and the step loop exits.

### Phase 2 — enrich (diagram)

For each staged artifact, invoke `sk.diagram.mermaid` via `McpInvoker` to generate Mermaid diagrams. Non-fatal — failure is logged and the step continues.

### Phase 3 — narrative_enrich

For each staged artifact, call Claude directly (not via a skill) with the artifact JSON and the kind's `narratives_spec` to generate a Markdown narrative (`id: "auto:overview"`, `audience: "developer"`). Non-fatal.

After all three phases, `ArtifactPersister` batch-upserts the enriched artifacts to `workspace-manager-service`. `RunRecorder` marks the step complete in `learning-service`.

---

## 7. McpInvoker

```typescript
class McpInvoker {
  async invoke(
    skill: SkillDocument,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<unknown>
}
```

Key behaviour:

- Resolves `${ENV_VAR}` placeholders in `execution.base_url` and `execution.headers` at invocation time using `process.env`.
- Calls `tools/list` on the MCP server once per session per skill to discover the live input JSON schema. Caches the result in `RunState.discoveredSchemas[skill.name]` for the duration of the run — no repeated `tools/list` calls.
- Validates `args` against the discovered schema before invoking. One LLM repair attempt if validation fails.
- Streams or polls for async tool results (same pattern as Python `mcp_execution_node`).
- Respects `AbortSignal` — throws `AbortError` if cancelled, causing the step to fail cleanly.
- Retry config is read from `skill.execution.retry` (`max_attempts`, `backoff_ms`, `jitter_ms`).
- MCP transport: uses `@modelcontextprotocol/sdk` (TypeScript official SDK), which replaces the Python `MCPConnection` class.

---

## 8. ask_user Tool

This is architecturally the most novel capability vs the Python backend — mid-run interactive input was impossible in V1.

### Tool definition presented to Claude

```typescript
{
  name: "ask_user",
  description: "Suspend execution and ask the user a question. Use when required inputs are missing or ambiguous before invoking a skill.",
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user."
      },
      input_type: {
        type: "string",
        enum: ["text", "url", "file_path", "select"],
        description: "Expected input modality."
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "If input_type is select, the choices."
      }
    },
    required: ["question", "input_type"]
  }
}
```

### Suspension and resumption flow

When Claude invokes `ask_user`, `ExecutionCore`:

1. Emits an `agent:ask_user` IPC event to the renderer with the question and a unique `token`.
2. Suspends the step by awaiting a `Promise` keyed on `token`.
3. The renderer renders the input UI inline in the chat. The user responds.
4. The renderer sends an `agent:user_input` IPC event back with `{ token, value }`.
5. `AgentController.provideUserInput()` resolves the waiting Promise.
6. Execution resumes with the user's answer injected into Claude's conversation as a `tool_result`.

---

## 9. invoke_skill_pack Tool

```typescript
{
  name: "invoke_skill_pack",
  description: "Execute a named skill pack's playbook in full. Use when the user's intent maps exactly to a registered skill pack.",
  input_schema: {
    type: "object",
    properties: {
      pack_key: { type: "string" },
      pack_version: { type: "string" },
      inputs: {
        type: "object",
        description: "Pack-level inputs as declared in the pack's pack_input_id schema."
      }
    },
    required: ["pack_key"]
  }
}
```

When Claude invokes `invoke_skill_pack`, `ExecutionCore` switches to `PackStrategy` mid-run for that tool call — it fetches the pack, builds the step sequence from the playbook, and runs all steps through the same step loop. This allows intent-driven and pack-driven execution to compose naturally within a single conversation turn.

---

## 10. Streaming

`Streamer` fans out two streams simultaneously to the renderer via Electron IPC (`webContents.send`):

### Token stream — `agent:token`

Raw text tokens from `anthropic.messages.stream()` for the conversational narration. Renders word-by-word in the chat bubble.

### Event stream — `agent:event`

Structured status events:

| Event | Payload | When |
|---|---|---|
| `plan:step_added` | `{ step }` | As Claude decides each skill to invoke |
| `run:step_started` | `{ stepIndex, skillId }` | When a step begins |
| `run:step_completed` | `{ stepIndex, skillId, artifactCount }` | When a step finishes |
| `run:step_failed` | `{ stepIndex, skillId, error }` | On step failure |
| `run:completed` | `{ runId }` | Run finished successfully |
| `run:failed` | `{ runId, error }` | Run terminated with error |
| `agent:ask_user` | `{ token, question, input_type, options? }` | Mid-run input request |
| `agent:notification` | `{ text }` | Non-step narration from Claude |

The renderer merges these streams: tokens render in the chat bubble; step events update the plan panel on the right. Step-level progress events are also published to `notification-service` for the workspace activity feed.

---

## 11. Session Management

`SessionManager` maintains the `AnthropicMessage[]` history for each session:

- Loaded from `session-svc` at the start of each user turn.
- Appended with the new user message and the agent's full response (including all `tool_use` and `tool_result` blocks) after `message_stop`.
- Written back to `session-svc` after `message_stop`.

`session-svc` stores the document as:

```typescript
interface SessionDocument {
  session_id: string;
  workspace_id: string;
  messages: AnthropicMessage[];
  reasoning_trace?: AnthropicMessage[]; // full tool-use reasoning chain — separate from conversation replay
  created_at: string;
  updated_at: string;
}
```

The `reasoning_trace` field stores the full Claude tool-use sequence (which skills were considered vs selected). It is kept separate from `messages` so that conversation replay in the UI stays clean — only the conversational narration and final tool results appear in the chat.

This means if the Electron app crashes or restarts mid-session, the conversation history is fully recoverable from `session-svc`.

### Skill manifest cache invalidation

The in-memory skill manifest cache (TTL 5 min) is supplemented by a WebSocket listener on `notification-service`. When `skill-registry-service` publishes a `skill.updated` or `skill.created` event to RabbitMQ → `notification-service`, the Electron app's WebSocket listener receives it and immediately invalidates the in-memory cache. This is the same pattern the Python planner-service uses for its capability manifest cache.

---

## 12. Multi-Workspace Isolation

Each workspace tab in the Electron app maps to one `AgentController`. The main process map is:

```typescript
const controllers = new Map<string, AgentController>(); // workspaceId → controller
```

### Cancellation

```typescript
// User clicks Stop in workspace "ws-123"
controllers.get("ws-123")?.cancel();
// controllers.get("ws-456") is completely unaffected
```

`AbortSignal` is threaded through `McpInvoker`, `LlmInvoker`, and all `fetch()` calls. On abort:

1. In-flight HTTP connections are closed.
2. The current step is marked `cancelled`.
3. `RunRecorder` finalises the run as `cancelled` in `learning-service`.
4. The renderer receives a `run:cancelled` event.

### Concurrency limit

One active run per workspace. A workspace is the natural isolation boundary. Multiple concurrent workspaces, each with one active run, is fully supported.

---

## 13. Electron App Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Electron 30+ | In-process agent, no network hop to Anthropic |
| Renderer | React 19 + Vite | Consistent with VSCode extension codebase |
| Styling | Tailwind CSS 4 + shadcn/ui | Consistent component library across both frontends |
| IPC | `contextBridge` + typed IPC channels | Safe renderer isolation |
| Agent process | Electron main process (Node.js) | Direct Anthropic SDK, no proxy layer |
| State (renderer) | Zustand | Already used in VSCode extension |
| Anthropic SDK | `@anthropic-ai/sdk` (TypeScript) | First-class streaming support, direct SSE |
| MCP client | `@modelcontextprotocol/sdk` (TypeScript) | Official SDK, replaces Python `MCPConnection` |
| HTTP client | Native `fetch` (Node 18+) | No extra dependencies |
| Build tooling | `electron-vite` | Unified Vite config for main + renderer, HMR in renderer, auto-restart for main |
| Packaging | `electron-builder` | Standard for production distribution |

`electron-vite` is the recommended build tooling — it provides a single monorepo build with HMR for the renderer and auto-restart for the main process during development, which significantly improves the inner dev loop over rolling separate Webpack/Vite configs per process.

---

## 14. Open Questions — Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Should intent-driven run logs include the full skill reasoning chain, or only artifact provenance? | Store the full Claude tool-use reasoning chain in `session-svc` as a separate `reasoning_trace` field. Do not include it in the main `messages` array — conversation replay stays clean. |
| 2 | Skill manifest cache invalidation strategy when `SKILL.md` body changes but frontmatter does not? | In-memory TTL of 5 min as baseline. Supplement with a WebSocket listener on `notification-service` that reacts to `skill.updated` / `skill.created` events from RabbitMQ for immediate invalidation. |
| 3 | How many concurrent runs should the Astra Agent support per Electron app instance? | One active run per workspace. Multiple concurrent workspaces, each with one run, is supported. |
| 4 | Strategy for keeping `sk.*` skills in sync with `cap.*` counterparts when a capability is updated | Out of scope for this phase. |

---

## 15. ADR Cross-Reference

| ADR | Title | How this design implements it |
|---|---|---|
| ADR-009 | Unified Astra Agent in the Electron Desktop Frontend | `AgentController` is the single TypeScript agent; planner/conductor distinction eliminated |
| ADR-011 | MCP integration via skill frontmatter; one tool per skill enforced | `McpInvoker` resolves tool schema at runtime via `tools/list`; `SkillDocument.execution.tool_name` is a single string |
| ADR-012 | LLM agnosticism deferred at the orchestration layer | Claude (`@anthropic-ai/sdk`) is the explicit dependency in `IntentStrategy`; acknowledged and deferred |
| ADR-013 | Unified conversational streaming across all run modes | `Streamer` uses the same token + event fan-out for both intent-driven and pack-driven runs |
