# Astra Agent — Current Implementation State

**Last Updated:** April 2026 (17 Apr)  
**Branch:** master  
**Purpose:** Living record of what the Astra Agent has implemented, how it diverges from the original design (`astra-agent-design.md`), and what remains to be built. This document is the control surface for how the agent evolves.

---

## Table of Contents

1. [Implementation Location](#1-implementation-location)
2. [Module Structure — Actual](#2-module-structure--actual)
3. [What Is Fully Implemented](#3-what-is-fully-implemented)
4. [Divergences from the Design](#4-divergences-from-the-design)
5. [Not Yet Implemented](#5-not-yet-implemented)
6. [Component-Level Detail](#6-component-level-detail)
7. [Known Gaps and Risks](#7-known-gaps-and-risks)

---

## 1. Implementation Location

The design doc (`astra-agent-design.md`) originally specified the agent would live at `electron/src/agent/`. The actual implementation is split across two locations:

| Location | Role |
|---|---|
| `packages/astra-agent/src/` | Core agent engine (framework-agnostic TypeScript library) |
| `apps/electron-desktop/src/main/agent/` | Electron-specific bridge (`AgentRegistry`, `StreamBridge`) |

This is a better architectural decision than the design — the agent package is cleanly separated from Electron and could be tested or reused independently. The Electron bridge is a thin adapter.

---

## 2. Module Structure — Actual

```
packages/astra-agent/src/
├── index.ts                          ← Public API exports
├── controller/
│   └── AgentController.ts
├── strategies/
│   ├── IStrategy.ts                  ← Added (interface)
│   ├── IntentStrategy.ts
│   └── PackStrategy.ts
├── execution/
│   ├── ExecutionCore.ts
│   ├── StepRunner.ts                 ← Added (split from ExecutionCore)
│   └── phases/
│       ├── DiscoverPhase.ts          ← Added (explicit phase class)
│       ├── DiagramPhase.ts           ← Added (was EnrichmentPhase in design)
│       └── NarrativePhase.ts         ← Added (was EnrichmentPhase in design)
├── skills/
│   ├── SkillResolver.ts
│   ├── SkillManifestCache.ts         ← Added (explicit cache class)
│   └── SkillToToolConverter.ts       ← Added (explicit converter class)
├── tools/
│   ├── ToolRegistry.ts
│   ├── AskUserTool.ts
│   └── InvokeSkillPackTool.ts
├── mcp/
│   └── McpSessionPool.ts             ← Added (connection pooling)
├── invokers/
│   ├── IInvoker.ts                   ← Added (interface)
│   ├── McpInvoker.ts
│   └── LlmInvoker.ts
├── session/
│   └── SessionManager.ts
├── conversation/
│   └── ConversationManager.ts        ← Added (enhanced session manager)
├── streaming/
│   └── Streamer.ts
├── persistence/
│   ├── ArtifactPersister.ts
│   ├── RawArtifactUploader.ts        ← Added (stores via JSON artifact endpoint)
│   └── RunRecorder.ts
├── http/
│   ├── ServiceClient.ts              ← Added (base HTTP client)
│   └── clients/
│       ├── SkillRegistryClient.ts
│       ├── SessionClient.ts
│       ├── WorkspaceManagerClient.ts
│       ├── ConfigForgeClient.ts
│       ├── ArtifactRegistryClient.ts ← Added (kind schema lookup from artifact-service)
│       ├── LlmClientFactory.ts       ← Added (multi-provider LLM factory)
│       └── LearningClient.ts         ← Legacy, not called by agent
└── types/
    ├── agent.types.ts
    ├── plan.types.ts
    ├── skill.types.ts
    ├── stream.types.ts
    └── service.types.ts

apps/electron-desktop/src/main/agent/
├── AgentRegistry.ts
└── StreamBridge.ts

apps/electron-desktop/src/renderer/components/shell/
├── PlanApprovalPrompt.tsx            ← Added (plan approval UI)
└── ChatPanel.tsx                     ← Mounts PlanApprovalPrompt
```

---

## 3. What Is Fully Implemented

Every component below is production-ready and matches or improves on the design intent.

### AgentController
- One controller per workspace, created lazily by `AgentRegistry`
- `startIntentRun()` and `startPackRun()` as designed
- `cancel()` via per-run `AbortController`
- `provideUserInput(token, value)` — resume `ask_user` suspension
- `approvePlan(token, approved)` — resume plan approval suspension
- `invalidateSkillCache()` — triggered by WebSocket events from `notification-service`
- Full dependency injection; no global state

### Plan Approval (full stack)
- After planning, execution suspends until user approves
- `AgentController.awaitPlanApproval()` emits `plan:awaiting_approval` with token + step list
- `StreamBridge` forwards to renderer via `AGENT_PLAN_APPROVAL_REQUEST` IPC channel
- `AgentRegistry.approvePlan()` iterates all controllers to resolve the token
- `PlanApprovalPrompt` component in renderer shows steps; "Run plan" / "Cancel" buttons
- `AgentController.approvePlan()` resolves the awaiting Promise; cancelled runs emit `run:cancelled`
- Wired in `useAgentStream` and Zustand `agentSlice`

### IntentStrategy
- Loads full published skill manifest from `SkillManifestCache`
- Converts each `SkillDocument` to Anthropic `Tool` via `SkillToToolConverter`
- Adds `ask_user` and `invoke_skill_pack` meta-tools
- Calls `anthropic.messages.stream()` with full conversation history
- Collects `tool_use` blocks progressively into `PlanStep` objects
- Multi-turn loop: Claude may invoke `ask_user` multiple times before finalising plan
- Handles `invoke_skill_pack` by switching to `PackStrategy` mid-run
- Streams tokens to renderer in real time
- If no tool calls → conversational answer, no plan created
- Persists updated conversation history to session service after planning turn

### PackStrategy
- Fetches `SkillPackDocument` from `SkillRegistryClient`
- Maps `playbook.steps` → `PlanStep[]` with no LLM call
- Deterministic and fast

### ExecutionCore + StepRunner
- Creates run ID via `RunRecorder`
- Pre-resolves `sk.diagram.mermaid` diagram skill once per run
- Iterates plan steps sequentially; cancels remaining steps if discover phase fails
- **Run-local artifact context:** accumulates produced artifacts by kind in `runArtifacts: Record<string, unknown>`. For LLM-mode steps, injects `_artifact_context` into step args so each LLM skill can read all prior-step outputs.
- Emits `run:completed` / `run:failed` / `run:cancelled` at end of run

### Three-Phase Pipeline (per step)
1. **DiscoverPhase** (fatal) — invokes skill via `McpInvoker` or `LlmInvoker`, returns `StagedArtifact[]`
2. **DiagramPhase** (non-fatal) — invokes `sk.diagram.mermaid` for each artifact; failures logged to terminal only (no chat noise)
3. **NarrativePhase** (non-fatal) — calls Claude to generate Markdown narrative per artifact; failures logged and skipped

### McpInvoker
- Resolves `${ENV_VAR}` in `base_url` and `headers` at invocation time
- Strips `_`-prefixed internal keys (e.g. `_artifact_context`) before passing args to MCP server
- Calls `tools/list` once per (session, skill) pair; caches both the tool schema and the full tool list for run duration
- Injects actual `workspace_id` UUID before checking for missing required fields — prevents repair LLM from guessing IDs from intent text
- Validates args against discovered schema; builds repair prompt with full field names, descriptions, and semantic-rename instructions; one LLM repair attempt if validation fails
- Per-call MCP SDK timeout: passes `execution.timeout_sec * 1000` to `callTool()`, overriding the SDK default 60s
- **Async job polling (auto-detected):** if response has `job_id` + `status: "queued"|"running"`, finds sibling `.status` tool (`.start` → `.status` suffix swap, verified against cached tool list), polls every 3–10s with exponential backoff until `"done"` or `"error"`. Total timeout: `max(timeout_sec * 1000, 10 minutes)`
- **Pagination (auto-detected):** if response has `next_cursor`, calls same tool repeatedly with `cursor` + `run_id`, merges all `artifacts` arrays
- **Multi-artifact envelope:** if final JSON has top-level `artifacts` array, returns one `StagedArtifact` per element (each with its own `kind_id`)
- Unwraps MCP content envelope: `{ content: [{ type:'text', text:'...' }] }` → JSON-parsed artifact data
- Derives human-readable `name` from kind identifier (e.g. `cam.asset.raina_input` → `"Raina Input"`)
- Retry loop with `max_attempts`, `backoff_ms`, `jitter_ms` from skill execution config
- Respects `AbortSignal` throughout

### LlmInvoker
- **Kind schema lookup:** Before building the prompt, calls `GET /registry/kinds/{kind_id}` on artifact-service to fetch the JSON schema for the artifact kind being produced. If found, the schema is injected into the prompt so the LLM generates schema-conforming output. Non-fatal — proceeds without schema if artifact-service is unreachable or kind not found.
- Resolves LLM config from ConfigForge via skill's `llm_config_ref` frontmatter field (also accepts `config_ref` alias). Skips incompatible providers (e.g. OpenAI config ref when Bedrock client is active); falls back to planner model.
- Uses `messages.stream()` + `finalMessage()` to satisfy Bedrock's streaming requirement for high-`max_tokens` calls (>64k).
- Filters `_artifact_context` and `_`-prefixed keys from visible args. Renders prior-step artifacts as grounded `## Artifacts produced by prior steps` context blocks.
- Strips markdown fences from response, JSON-parses; structured JSON stored directly as artifact data. Falls back to `{ text: "..." }` if not valid JSON.
- Derives artifact `name` from kind identifier.

### SkillResolver
- Parses `llm_config_ref` from YAML frontmatter (also accepts `config_ref` as alias) — fixes the field-name mismatch where skills use `llm_config_ref` but the original parser only looked for `config_ref`.
- Parses full MCP execution config from frontmatter (transport, base_url, protocol_path, tool_name, headers, retry block)
- Parses `produces_kinds` from both inline `[...]` and block-list YAML forms

### ArtifactRegistryClient
- New HTTP client for artifact-service at `http://127.0.0.1:9020`
- `GET /registry/kinds/{kind_id}` → returns `ArtifactKindResponse` with `schema_versions[].json_schema`
- Returns `null` on 404 — callers proceed without schema

### ArtifactPersister
- Batch-upserts enriched `StagedArtifact[]` to `workspace-manager-service` after all three phases complete
- Passes `name` field through to upsert requests
- Logs kind names and count before/after each batch call

### RawArtifactUploader
- Stores file payloads via existing `POST /artifact/{workspaceId}` JSON endpoint (no S3)
- `data` field carries `{ filename, mime_type, content: "<base64>" }`
- Emits `agent:raw_artifact_uploaded` via `Streamer` after successful upsert

### McpSessionPool
- One `@modelcontextprotocol/sdk` Client per (sessionId, skillName)
- Lazy init; reused within session
- Supports both HTTP (`StreamableHTTPClientTransport`) and SSE (`SSEClientTransport`)
- `closeSession()` and `closeAll()` for lifecycle management

### SkillManifestCache
- 5-minute TTL cache of published skills from `skill-registry-service`
- Immediate invalidation via `notification-service` WebSocket events (`skill.created`, `skill.updated`)
- Graceful degradation: agent falls back to pure conversation if registry is unreachable

### SkillToToolConverter
- `sk.foo.bar` → tool name `sk__foo__bar` (dots → double-underscores, Anthropic tool name constraint)
- Reverse mapping `toSkillName()` used when extracting tool calls from Claude response

### ConversationManager (enhanced SessionManager)
- Context window: first message + last 39 messages (40 total)
- Auto-naming: fires a Haiku call after the first turn to name the conversation

### ask_user Tool
- Fully implemented per design
- Suspension/resumption via `Promise` keyed on UUID token
- Renderer receives `agent:ask_user` IPC event; responds via `agent:user_input`

### invoke_skill_pack Tool
- When Claude invokes it, `ExecutionCore` switches to `PackStrategy` for that call
- Intent-driven and pack-driven execution compose naturally within one conversation turn

### Streaming (Streamer + StreamBridge)
- `Streamer`: typed Node.js `EventEmitter`; all events are `AgentEvent` union types
- `StreamBridge`: maps each `AgentEvent` to the correct Electron IPC channel
- `useAgentStream` hook: subscribes once in `App.tsx`; refreshes artifact list on `run:completed` and `run:failed`

### LlmClientFactory
- Resolves LLM config from ConfigForge at runtime
- Supports direct Anthropic API and AWS Bedrock (`AnthropicBedrock`)
- Secret resolution: `"literal:<value>"` and `"${ENV_VAR}"` patterns

### Multi-Workspace Isolation
- `AgentRegistry` holds `Map<workspaceId, AgentController>`
- Each workspace has its own `AbortController`; cancellation is workspace-scoped
- One active run per workspace; multiple workspaces can run in parallel

---

## 4. Divergences from the Design

### 4.1 Two-Pass Manifest Scoping — NOT IMPLEMENTED

**Design (§13):** `IntentStrategy` was specified to use a two-pass approach:
- **Pass 1:** Load only `domain: 'astra'` skills filtered to the workspace's product tag
- **Pass 2:** If Pass 1 yields no tool calls and user message contains file-production signals, re-run with `domain: 'general'` skills added

**Actual:** `IntentStrategy` loads the full published skill manifest in a single pass without domain filtering or workspace tag scoping.

**Status:** Deferred. See §5.

---

### 4.2 Raw Artifact Storage — JSON Endpoint Instead of S3

**Design (ADR-016):** `RawArtifactUploader` uploads to S3 via new `workspace-manager-service` endpoints.

**Actual:** `workspace-manager-service` has no S3/file upload endpoint. `RawArtifactUploader` stores file payloads as JSON documents via the existing `POST /artifact/{workspaceId}` endpoint, with `data: { filename, mime_type, content: "<base64>" }`. S3 storage is deferred to a future backend sprint.

**Assessment:** Functionally equivalent for current use. No S3 provisioning required.

---

### 4.3 Branch B/C Routing — PARTIALLY IMPLEMENTED

**Design (§6):** Three execution branches based on `skill.domain` and `raw_artifact_envelope`.

**Actual:** `SkillDocument` has `domain` and `raw_artifact_envelope` fields. `RawArtifactUploader` exists. However, `StepRunner` still routes all steps through the full three-phase ASTRA pipeline regardless of domain. Branch B and C routing has not been wired into `StepRunner`.

**Status:** `StepRunner` needs branch routing logic added. See §5.

---

### 4.4 RunRecorder — In-Process Only (deliberate deferral)

**Design (§6):** `RunRecorder` creates and updates `PlaybookRun` records in `learning-service`.

**Actual:** `RunRecorder` is in-process only. `LearningClient` exists but is not wired.

**Status:** Deliberate deferral. `LearningClient` is ready; wiring is straightforward when needed.

---

### 4.5 EnrichmentPhase Split → DiagramPhase + NarrativePhase

**Design (§6):** A single `EnrichmentPhase.ts`.

**Actual:** Split into `DiagramPhase.ts` and `NarrativePhase.ts`. Better design — each has single responsibility. `DiagramPhase` logs failures to terminal only (no chat spam). **Assessment:** Improvement over the design.

---

### 4.6 ConversationManager Additions (Beyond Design)

**Design (§11):** Basic `SessionManager` with load/save.

**Actual:** Two classes: `SessionManager` (matches design) and `ConversationManager` (adds 40-message context windowing and auto-naming). **Assessment:** Enhancement. Production code uses `SessionClient` in `AgentController` for history load/save; `ConversationManager` is available for full session management.

---

### 4.7 Module Location

**Design:** `electron/src/agent/`  
**Actual:** `packages/astra-agent/` + `apps/electron-desktop/src/main/agent/`  
**Assessment:** Better than the design. No action required.

---

## 5. Not Yet Implemented

| Feature | Design Section | Priority | Notes |
|---|---|---|---|
| **Branch B/C routing in StepRunner** | §6 | High | `RawArtifactUploader` exists; routing logic needs to be added to `StepRunner` |
| **Two-pass manifest scoping** | §13 | Medium | Pass 1 ASTRA-only, Pass 2 widen to general |
| **Workspace product tag filtering** | §13 | Medium | Filter ASTRA skills by workspace tag (RAINA/Neozeta/SABA) |
| **RunRecorder → learning-service** | §6 | Low | `LearningClient` ready; wiring deferred |
| **S3 raw artifact storage** | ADR-016 | Low (backend) | Deferred until `workspace-manager-service` gains file endpoints |
| **ask_user timeout** | §8 | Low | No timeout on suspension — can hang indefinitely if renderer never responds |
| **Skill registration onboarding wizard domain question** | §13 | Medium | UI question to set domain/raw_artifact_envelope during skill registration |

---

## 6. Component-Level Detail

### AgentController

```typescript
class AgentController {
  constructor(workspaceId: string, config: AgentServiceConfig)
  onEvent(listener: (event: AgentEvent) => void): () => void
  startIntentRun(intent: string, sessionId: string): Promise<void>
  startPackRun(packKey: string, packVersion: string, inputs: Record<string, unknown>, sessionId: string): Promise<void>
  cancel(): void
  provideUserInput(token: string, value: unknown): void
  approvePlan(token: string, approved: boolean): void
  invalidateSkillCache(): void
}
```

### AgentServiceConfig

```typescript
interface AgentServiceConfig {
  skillRegistryBaseUrl: string;       // http://127.0.0.1:9028
  sessionServiceBaseUrl: string;      // http://127.0.0.1:9029
  workspaceManagerBaseUrl: string;    // http://127.0.0.1:9027
  configForgeBaseUrl: string;         // http://127.0.0.1:8040
  artifactServiceBaseUrl: string;     // http://127.0.0.1:9020
  notificationServiceWsUrl: string;   // ws://127.0.0.1:8016/ws
  plannerConfigRef: string;           // e.g. "dev.llm.bedrock.explicit-creds"
}
```

### Streaming Events (fully implemented)

| Event | Channel | Payload |
|---|---|---|
| `token` | `AGENT_TOKEN` | `{ delta: string }` |
| `plan:step_added` | `AGENT_PLAN_UPDATE` | `{ step: PlanStep }` |
| `run:step_started` | `AGENT_PLAN_UPDATE` | `{ stepIndex, skillId, status: 'running' }` |
| `run:step_completed` | `AGENT_PLAN_UPDATE` | `{ stepIndex, skillId, status: 'completed', artifactCount }` |
| `run:step_failed` | `AGENT_PLAN_UPDATE` | `{ stepIndex, skillId, status: 'failed', error }` |
| `run:completed` | `AGENT_RUN_COMPLETE` | `{}` |
| `run:failed` | `AGENT_ERROR` | `{ error }` |
| `run:cancelled` | `AGENT_RUN_COMPLETE` | `{}` |
| `plan:awaiting_approval` | `AGENT_PLAN_APPROVAL_REQUEST` | `{ token, steps: PlanStep[] }` |
| `agent:ask_user` | `AGENT_ASK_USER` | `{ token, question, input_type, options? }` |
| `agent:raw_artifact_uploaded` | `AGENT_PLAN_UPDATE` | `{ artifact_id, filename, mime_type, kind }` |
| `agent:notification` | `AGENT_TOKEN` | `{ delta: string }` |

### Service Endpoints Used by the Agent

| Service | Base URL | Purpose |
|---|---|---|
| skill-registry-service | `http://127.0.0.1:9028` | Skill manifest, skill pack fetch |
| conversation-service (session-svc) | `http://127.0.0.1:9029` | Conversation history load/save |
| workspace-manager-service | `http://127.0.0.1:9027` | Artifact batch-upsert (`/artifact/{id}/batch`) |
| config-forge | `http://127.0.0.1:8040` | LLM config resolution |
| artifact-service | `http://127.0.0.1:9020` | Kind schema lookup (`/registry/kinds/{kind_id}`) |
| notification-service (WebSocket) | `ws://127.0.0.1:8016/ws` | Skill cache invalidation events |
| learning-service | `http://127.0.0.1:9022` | Run records (client exists, not wired) |

---

## 7. Known Gaps and Risks

### Medium — Branch B/C is not routed in StepRunner
`RawArtifactUploader` and `RawArtifactEnvelope` are implemented, but `StepRunner` still runs all skills through the full three-phase ASTRA pipeline. General file-producing skills (`domain: 'general'`, `raw_artifact_envelope` set) will fall through to Branch A and attempt MongoDB artifact persistence. This should be fixed before registering general/file skills for production use.

### Medium — No workspace tag scoping on skill manifest
All published skills are presented to Claude on every intent run. As the registry grows, the tool list will exceed recommended sizes and degrade planning quality. Implement two-pass scoping before onboarding more than ~30 skills.

### Low — ask_user has no timeout
If the renderer never sends `agent:user_input` after a suspension (user closes window, crash), the awaiting `Promise` never resolves. Wire the `AbortController` abort signal to the resolver map.

### Low — RunRecorder is in-process only
No persistent run history. Blocks run-replay, audit trail, and workspace activity feed features.

### Informational — LearningClient is dead code
`packages/astra-agent/src/http/clients/LearningClient.ts` exists but is not called anywhere. Wire into `RunRecorder` when run persistence is needed, or remove.

### Informational — upsert-batch response format
`ArtifactPersister` logs `"upsert-batch OK: undefined artifact(s) saved"` — `result.length` is undefined, suggesting the batch response may not be a plain array (could be `{ artifacts: [...] }` or similar). The artifacts are being saved (200 OK confirmed) but the count log is incorrect. Investigate the actual response shape from `workspace-manager-service`.
