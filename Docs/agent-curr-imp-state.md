# Astra Agent — Current Implementation State

**Last Updated:** April 2026  
**Branch:** master  
**Purpose:** Living record of what the Astra Agent has implemented, how it diverges from the original design (`astra-agent-design.md`), and what remains to be built. This document is the control surface for how the agent evolves.

---

## Table of Contents

1. [Implementation Location](#1-implementation-location)
2. [Module Structure — Design vs Actual](#2-module-structure--design-vs-actual)
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

## 2. Module Structure — Design vs Actual

### Design

```
electron/src/agent/
├── index.ts
├── strategies/
│   ├── IntentStrategy.ts
│   └── PackStrategy.ts
├── core/
│   ├── ExecutionCore.ts
│   ├── SkillResolver.ts
│   ├── McpInvoker.ts
│   ├── LlmInvoker.ts
│   ├── EnrichmentPhase.ts
│   ├── ArtifactPersister.ts
│   ├── RawArtifactUploader.ts        ← Not implemented
│   ├── RunRecorder.ts
│   └── Streamer.ts
├── session/
│   └── SessionManager.ts
├── tools/
│   ├── registry.ts
│   ├── invoke_skill_pack.ts
│   └── ask_user.ts
└── types.ts
```

### Actual

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
│   └── RunRecorder.ts
├── http/
│   ├── ServiceClient.ts              ← Added (base HTTP client)
│   └── clients/
│       ├── SkillRegistryClient.ts
│       ├── SessionClient.ts
│       ├── WorkspaceManagerClient.ts
│       ├── ConfigForgeClient.ts
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
```

---

## 3. What Is Fully Implemented

Every component below is production-ready and matches the design intent.

### AgentController
- One controller per workspace, created lazily by `AgentRegistry`
- `startIntentRun()` and `startPackRun()` as designed
- `cancel()` via per-run `AbortController`
- `provideUserInput(token, value)` — resume `ask_user` suspension
- `invalidateSkillCache()` — triggered by WebSocket events from `notification-service`
- Full dependency injection; no global state

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

### PackStrategy
- Fetches `SkillPackDocument` from `SkillRegistryClient`
- Maps `playbook.steps` → `PlanStep[]` with no LLM call
- Deterministic and fast

### ExecutionCore + StepRunner
- Creates run ID via `RunRecorder`
- Pre-resolves `sk.diagram.mermaid` diagram skill once per run
- Iterates plan steps sequentially; cancels remaining steps if discover phase fails
- Emits `run:completed` / `run:failed` / `run:cancelled` at end of run

### Three-Phase Pipeline (per step)
1. **DiscoverPhase** (fatal) — invokes skill via `McpInvoker` or `LlmInvoker`, returns `StagedArtifact[]`
2. **DiagramPhase** (non-fatal) — invokes `sk.diagram.mermaid` for each artifact; failures are logged and skipped
3. **NarrativePhase** (non-fatal) — calls Claude to generate Markdown narrative per artifact; failures are logged and skipped

### McpInvoker
- Resolves `${ENV_VAR}` in `base_url` and `headers` at invocation time
- Calls `tools/list` once per (session, skill) pair; caches schema for run duration
- Validates args against discovered schema; one LLM repair attempt if validation fails
- Retry loop with `max_attempts`, `backoff_ms`, `jitter_ms` from skill execution config
- Respects `AbortSignal` throughout

### LlmInvoker
- Calls Claude directly with skill description and args
- Resolves LLM client via `LlmClientFactory` (ConfigForge ref)
- Returns single `StagedArtifact`

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
- `sk.foo.bar` → tool name `sk__foo__bar` (dots replaced with double-underscores, Anthropic tool name constraint)
- Reverse mapping `toSkillName()` used when extracting tool calls from Claude response
- Tool description includes `produces_kinds`, `depends_on`, `tags` for planning context
- Input schema from `parameters_schema` (not the MCP tool schema — that is resolved at runtime)

### ConversationManager (enhanced SessionManager)
- Context window: first message + last 39 messages (40 total) to keep history manageable
- Auto-naming: fires a Haiku call after the first turn to name the conversation
- `saveMessages()` handles incremental appends and windowing transparently

### ask_user Tool
- Fully implemented per design
- Suspension/resumption via `Promise` keyed on UUID token
- Renderer receives `agent:ask_user` IPC event; responds via `agent:user_input`
- `AgentController.provideUserInput()` resolves the promise and resumes planning

### invoke_skill_pack Tool
- Fully implemented per design
- When Claude invokes it, `ExecutionCore` switches to `PackStrategy` for that call
- Intent-driven and pack-driven execution compose naturally within one conversation turn

### ArtifactPersister
- Batch-upserts enriched `StagedArtifact[]` to `workspace-manager-service` after all three phases complete
- Uses `/artifact/{workspaceId}/batch` endpoint

### Streaming (Streamer + StreamBridge)
- `Streamer`: typed Node.js `EventEmitter`; all events are `AgentEvent` union types
- `StreamBridge`: maps each `AgentEvent` to the correct Electron IPC channel (`webContents.send`)
- All event types from the design are handled: tokens, plan updates, step status, run completion, ask_user, notifications

### LlmClientFactory
- Resolves LLM config from ConfigForge at runtime
- Supports direct Anthropic API (env `ANTHROPIC_API_KEY` fast path) and AWS Bedrock (`AnthropicBedrock`)
- AWS Bedrock patch: overrides `buildRequest` to handle SDK async wrapper quirk
- Secret resolution: `"literal:<value>"` and `"${ENV_VAR}"` patterns

### Multi-Workspace Isolation
- `AgentRegistry` holds `Map<workspaceId, AgentController>`
- Each workspace has its own `AbortController`; cancellation is workspace-scoped
- One active run per workspace; multiple workspaces can run in parallel

---

## 4. Divergences from the Design

### 4.1 Two-Pass Manifest Scoping — NOT IMPLEMENTED

**Design (§13):** `IntentStrategy` was specified to use a two-pass approach:
- **Pass 1:** Load only `domain: 'astra'` skills filtered to the workspace's product tag (RAINA, Neozeta, SABA)
- **Pass 2:** If Pass 1 yields no tool calls and user message contains file-production signals ("write", "generate", "create a document"), re-run with `domain: 'general'` skills added

**Actual:** `IntentStrategy` loads the full published skill manifest in a single pass without domain filtering or workspace tag scoping. All published skills are presented to Claude on every intent run.

**Impact:** The tool list presented to Claude is larger than intended. For workspaces with many registered skills, this may add noise to Claude's planning context. The two-pass design was intended to keep the tool list tight and avoid surfacing irrelevant general skills.

**Status:** To be implemented. See §5.

---

### 4.2 Skill Domain Model (branch B) — PARTIALLY IMPLEMENTED

**Design (§6, §13):** Three execution branches based on `skill.domain` and `skill.raw_artifact_envelope`:
- Branch A: `domain: 'astra'` → full three-phase pipeline
- Branch B: `domain: 'general'` + `raw_artifact_envelope` defined → upload to S3 via `RawArtifactUploader`
- Branch C: `domain: 'general'` + no `raw_artifact_envelope` → return tool result conversationally

**Actual:** The `SkillDocument` type does define `domain` and `raw_artifact_envelope` fields. However, `RawArtifactUploader` is **not implemented** (the class does not exist in the codebase). `StepRunner` currently routes all skills through the same three-phase ASTRA pipeline regardless of domain. Branch B is effectively absent.

**Impact:** General/file-producing skills (`domain: 'general'`, `raw_artifact_envelope` set) will not work correctly — they will run through the ASTRA pipeline and attempt MongoDB artifact persistence, which will fail or produce incorrect results.

**Status:** `RawArtifactUploader` and Branch B routing need to be built. See §5.

---

### 4.3 RunRecorder — In-Process Only (by implementation choice)

**Design (§6):** `RunRecorder` was specified to create and update `PlaybookRun` records in `learning-service` — tracking run and step state persistently.

**Actual:** `RunRecorder` is in-process only. `createRun()` generates a local UUID. `markStepStarted()`, `markStepCompleted()`, `markRunCompleted()`, etc. are no-ops. `LearningClient` exists in the codebase but is not wired into the agent.

**Impact:** Run history is not persisted. No external run ledger. This is acceptable for the current phase but means the workspace activity feed and any run-replay features cannot be built on top of run records.

**Status:** Deliberate deferral. `LearningClient` is ready; wiring it into `RunRecorder` is straightforward when needed.

---

### 4.4 EnrichmentPhase Split → DiagramPhase + NarrativePhase

**Design (§6):** A single `EnrichmentPhase.ts` was specified to handle both diagram and narrative enrichment.

**Actual:** Split into two separate phase classes: `DiagramPhase.ts` and `NarrativePhase.ts`. This is a better implementation — each phase has a single responsibility, simpler error isolation, and is independently testable.

**Assessment:** Improvement over the design. No action required.

---

### 4.5 ConversationManager Additions (Beyond Design)

**Design (§11):** `SessionManager` was specified with basic load/save of `AnthropicMessage[]` history.

**Actual:** Two classes exist:
- `SessionManager` — matches the design spec
- `ConversationManager` — adds context windowing (40-message limit: first + last 39) and fire-and-forget Haiku-based auto-naming after the first turn

**Assessment:** `ConversationManager` is an enhancement not in the original design. It is the production-grade session manager. Verify that `AgentController` wires to `ConversationManager`, not the plain `SessionManager`, for production use.

---

### 4.6 Module Location

**Design:** `electron/src/agent/`  
**Actual:** `packages/astra-agent/` (monorepo library) + `apps/electron-desktop/src/main/agent/` (bridge)

**Assessment:** Better than the design. The agent is framework-independent and could be tested in isolation. No action required.

---

## 5. Not Yet Implemented

| Feature | Design Section | Priority | Notes |
|---|---|---|---|
| **RawArtifactUploader** | §14 / ADR-016 | High | Branch B cannot work without it |
| **Branch B routing in StepRunner** | §6 | High | `domain: 'general'` + `raw_artifact_envelope` path |
| **Two-pass manifest scoping** | §13 | Medium | Pass 1 ASTRA-only, Pass 2 widen to general |
| **Workspace product tag filtering** | §13 | Medium | Filter ASTRA skills by workspace tag (RAINA/Neozeta/SABA) |
| **RunRecorder → learning-service** | §6 | Low | `LearningClient` ready; wiring deferred |
| **Raw artifact workspace endpoints** | §14 | High (backend) | `POST/GET/DELETE /raw-artifact/{workspaceId}` on workspace-manager-service |
| **S3 workspace provisioning** | §14 | High (backend) | `workspace.created` event handler to provision S3 prefix |
| **ask_user timeout** | §8 | Low | No timeout on suspension — can hang indefinitely |
| **Skill registration onboarding wizard domain question** | §13 | Medium | UI question to set domain/raw_artifact_envelope during skill registration |
| **Streaming error recovery** | §10 | Low | `anthropic.messages.stream()` errors not explicitly handled in IntentStrategy |

---

## 6. Component-Level Detail

### AgentController

```typescript
class AgentController {
  constructor(workspaceId: string, config: AgentServiceConfig)
  onEvent(listener: (event: AgentEvent) => void): () => void
  startIntentRun(intent: string, sessionId: string): Promise<void>
  startPackRun(packKey: string, packVersion: string, inputs: Record<string, unknown>, sessionId: string): Promise<void>
  cancel(): Promise<void>
  provideUserInput(token: string, value: unknown): Promise<void>
  invalidateSkillCache(): void
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
| `run:completed` | `AGENT_RUN_COMPLETE` | `{ runId }` |
| `run:failed` | `AGENT_ERROR` | `{ error, fatal: true }` |
| `run:cancelled` | `AGENT_RUN_COMPLETE` | `{ cancelled: true }` |
| `agent:ask_user` | `AGENT_ASK_USER` | `{ token, question, input_type, options? }` |
| `agent:notification` | `AGENT_TOKEN` | `{ delta: string }` |

**Not yet emitted:** `agent:raw_artifact_uploaded` — depends on RawArtifactUploader (§5)

### Service Endpoints Used by the Agent

| Service | Base URL | Purpose |
|---|---|---|
| skill-registry-service | `http://127.0.0.1:9028` | Skill manifest, skill pack fetch |
| conversation-service (session-svc) | `http://127.0.0.1:9029` | Conversation history load/save |
| workspace-manager-service | `http://127.0.0.1:8010` | Artifact batch-upsert |
| config-forge | `http://127.0.0.1:8040` | LLM config resolution |
| notification-service (WebSocket) | `ws://127.0.0.1:8016/ws` | Skill cache invalidation events |
| learning-service | `http://127.0.0.1:9022` | Run records (client exists, not wired) |

---

## 7. Known Gaps and Risks

### High — Branch B is inoperative
General file-producing skills (`domain: 'general'`, `raw_artifact_envelope` set) have no working execution path. They will fall through to Branch A (ASTRA pipeline) and likely fail or produce garbage. Any skills registered with `raw_artifact_envelope` should not be used in production until Branch B is implemented.

### Medium — No workspace tag scoping on skill manifest
All published skills are presented to Claude on every intent run, regardless of which product (RAINA, Neozeta, SABA) the workspace is associated with. For small skill registries this is acceptable. As the registry grows, the tool list will exceed recommended sizes and degrade planning quality. Implement two-pass scoping before onboarding more than ~30 skills.

### Low — ask_user has no timeout
If the renderer never sends `agent:user_input` after a suspension (e.g., user closes the window, crash), the awaiting `Promise` in `ExecutionCore` will never resolve. The `AbortController` on `cancel()` does not currently reach the ask_user resolver. Add a timeout or wire the abort signal to the resolver map.

### Low — RunRecorder is in-process only
No persistent run history. Fine for conversational use. Blocks run-replay, audit trail, and activity feed features that depend on a run ledger.

### Informational — LearningClient is dead code
`packages/astra-agent/src/http/clients/LearningClient.ts` exists but is not wired into `RunRecorder` or called anywhere by the agent. It should either be wired into `RunRecorder` when run persistence is needed, or removed to avoid confusion.
