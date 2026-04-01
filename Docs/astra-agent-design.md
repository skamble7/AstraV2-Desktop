# Astra Agent — TypeScript Design

**Branch:** `feature/skill-based-architecture`  
**Status:** Accepted  
**Last Updated:** March 2026

---

## Table of Contents

- [Astra Agent — TypeScript Design](#astra-agent--typescript-design)
  - [Table of Contents](#table-of-contents)
  - [1. Position and Responsibilities](#1-position-and-responsibilities)
  - [2. Module Structure](#2-module-structure)
  - [3. Entry Point — AgentController](#3-entry-point--agentcontroller)
  - [4. Two Strategies, One Execution Core](#4-two-strategies-one-execution-core)
    - [IntentStrategy](#intentstrategy)
    - [PackStrategy](#packstrategy)
  - [5. System Prompt Design](#5-system-prompt-design)
  - [6. ExecutionCore — The Step Loop](#6-executioncore--the-step-loop)
    - [Branch A — ASTRA artifact skill (`domain: 'astra'`)](#branch-a--astra-artifact-skill-domain-astra)
    - [Branch B — General skill, file-producing (`domain: 'general'`, `raw_artifact_envelope` defined)](#branch-b--general-skill-file-producing-domain-general-raw_artifact_envelope-defined)
    - [Branch C — General skill, conversational (`domain: 'general'`, no `raw_artifact_envelope`)](#branch-c--general-skill-conversational-domain-general-no-raw_artifact_envelope)
    - [Branch selection logic](#branch-selection-logic)
  - [7. McpInvoker](#7-mcpinvoker)
  - [8. ask\_user Tool](#8-ask_user-tool)
    - [Tool definition presented to Claude](#tool-definition-presented-to-claude)
    - [Suspension and resumption flow](#suspension-and-resumption-flow)
  - [9. invoke\_skill\_pack Tool](#9-invoke_skill_pack-tool)
  - [10. Streaming](#10-streaming)
    - [Token stream — `agent:token`](#token-stream--agenttoken)
    - [Event stream — `agent:event`](#event-stream--agentevent)
  - [11. Session Management](#11-session-management)
    - [Skill manifest cache invalidation](#skill-manifest-cache-invalidation)
  - [12. Multi-Workspace Isolation](#12-multi-workspace-isolation)
    - [Cancellation](#cancellation)
    - [Concurrency limit](#concurrency-limit)
  - [13. Skill Domain Model — ASTRA vs General](#13-skill-domain-model--astra-vs-general)
    - [SkillDocument additions](#skilldocument-additions)
    - [Two-pass manifest scoping in IntentStrategy](#two-pass-manifest-scoping-in-intentstrategy)
    - [Skill registration — onboarding wizard domain question](#skill-registration--onboarding-wizard-domain-question)
  - [14. Raw Artifact Storage — S3](#14-raw-artifact-storage--s3)
    - [Workspace provisioning](#workspace-provisioning)
    - [New endpoints on workspace-manager-service](#new-endpoints-on-workspace-manager-service)
    - [RawArtifactUploader in the agent](#rawartifactuploader-in-the-agent)
    - [Event publishing](#event-publishing)
  - [15. Electron App Stack](#15-electron-app-stack)
  - [16. Open Questions — Resolved](#16-open-questions--resolved)
  - [17. ADR Cross-Reference](#17-adr-cross-reference)
  - [18. ADR-015 — General-Purpose Tool Invocation and Skill Domain Model](#18-adr-015--general-purpose-tool-invocation-and-skill-domain-model)
    - [Context](#context)
    - [Decision](#decision)
    - [Consequences](#consequences)
  - [19. ADR-016 — Raw Artifact S3 Storage and Workspace Provisioning](#19-adr-016--raw-artifact-s3-storage-and-workspace-provisioning)
    - [Context](#context-1)
    - [Decision](#decision-1)
    - [Consequences](#consequences-1)

---

## 1. Position and Responsibilities

The Astra Agent is a TypeScript module running in the **Electron main process**. It is the sole orchestrator for all skill-based work — it replaces what Python's `planner-service` and `conductor-service` do for capabilities. It never touches `cap.*` identifiers, `capability-service`, or any Python backend agent.

Its responsibilities are:

- Handle general-purpose conversations — the agent is a capable assistant even when no skills are invoked
- Receive a user intent or a skill pack selection from the renderer via IPC
- Produce a plan — via LLM reasoning (intent strategy) or by reading a pack playbook (pack strategy)
- Execute the plan step by step: resolve skills, invoke MCP tools or LLM, collect artifacts, run enrichment
- Route execution correctly based on skill domain: ASTRA artifact pipeline or raw artifact upload
- Stream tokens and status events back to the renderer in real time
- Persist conversation history to `session-svc` after each turn
---

## 2. Module Structure

```
electron/src/agent/
├── index.ts                      ← public entry: AgentController
├── strategies/
│   ├── IntentStrategy.ts         ← LLM-driven skill selection + scoped manifest loading
│   └── PackStrategy.ts           ← deterministic plan from sk pack playbook
├── core/
│   ├── ExecutionCore.ts          ← plan → step loop, three-branch execution routing
│   ├── SkillResolver.ts          ← resolves sk.* names to SkillDocument + MCP config
│   ├── McpInvoker.ts             ← connects to MCP server, calls tool, handles retries
│   ├── LlmInvoker.ts             ← executes LLM-mode skills via ConfigForge ref
│   ├── EnrichmentPhase.ts        ← diagram + narrative enrichment (ASTRA skills only)
│   ├── ArtifactPersister.ts      ← batch-upserts to workspace-manager-service (MongoDB)
│   ├── RawArtifactUploader.ts    ← uploads raw files to workspace-manager-service (S3)
│   ├── RunRecorder.ts            ← creates/updates PlaybookRun in learning-service
│   └── Streamer.ts               ← token + event fan-out to renderer via IPC
├── session/
│   └── SessionManager.ts         ← load/save AnthropicMessages to session-svc
├── tools/
│   ├── registry.ts               ← builds Anthropic tool definitions from SkillDocuments
│   ├── invoke_skill_pack.ts      ← tool: execute a named skill pack by playbook
│   └── ask_user.ts               ← tool: suspend execution, request renderer input
└── types.ts                      ← shared agent types
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

1. Loads a **scoped skill manifest** from `skill-registry-service` — see §13 for the two-pass scoping rules.
2. Converts each `SkillDocument` into an Anthropic tool definition using `tools/registry.ts` — the tool name is the `sk.*` identifier, the description is the skill's `description` field, and the input schema is the skill's `parameters_schema` (not the MCP tool's schema — that is resolved at execution time).
3. Also registers two meta-tools: `invoke_skill_pack` and `ask_user`.
4. Calls `anthropic.messages.stream()` with the full conversation history, the system prompt (see §5), the user message, and the scoped tool definitions.
5. As Claude returns `tool_use` blocks, each represents a skill the agent has decided to invoke. These are collected into an ordered `Plan` — a list of `PlanStep` objects.
6. The plan is streamed to the renderer progressively as steps are decided, not batch-returned after the full response.
7. If Claude responds with no tool calls, the response is treated as a general-purpose conversational answer and streamed directly — no plan, no execution.

### PackStrategy

Invoked when the user selects a skill pack and clicks Run. Steps:

1. Fetches the `SkillPackDocument` from `skill-registry-service`.
2. Reads `playbook.steps` directly — no Claude call, no LLM.
3. Converts each step into a `PlanStep` with the step's `skill_id` and any declared `parameters`.
4. Hands the plan to `ExecutionCore` immediately.

---

## 5. System Prompt Design

The intent strategy system prompt is the most important design decision in the agent. Its job is to make Claude a capable general-purpose assistant that is also an expert orchestrator of `sk.*` skills.

```
You are the Astra Agent — an intelligent assistant and orchestrator for a
knowledge-generation platform. You can hold general conversations, answer
technical questions, and help users think through problems directly — you
do not need to invoke a skill for every response.

When the user's intent requires producing a structured artifact, discovering
architecture, processing legacy code, or generating a file, you invoke the
appropriate registered skill. Otherwise, you respond conversationally.

SKILLS
You have access to a set of registered skills (sk.* tools). Skills come in
two domains:

  astra   — knowledge-generation skills that produce ASTRA-governed artifacts
            (architecture models, learning artifacts, agile deliverables).
            These are workspace-tracked and schema-validated.

  general — skills that produce files (documents, images, spreadsheets) or
            call external APIs. Results are stored in the workspace file store
            or returned conversationally.

Each skill:
- Executes exactly one MCP tool
- Has a detailed description explaining WHEN to use it, not just what it does
- May depend on artifacts produced by earlier skills

PLANNING BEHAVIOUR
- Think step by step about what the user wants to produce
- Select only the skills needed — do not invoke skills that are not required
- Respect dependency order: never invoke a skill before its depends_on skills have run
- If inputs are missing, use ask_user to request them before invoking skills
- If the user's intent maps exactly to a registered skill pack, use invoke_skill_pack

EXECUTION BEHAVIOUR
- Invoke skills one at a time; wait for each to complete before proceeding
- After each skill, describe briefly what was produced and whether it succeeded
- If a skill fails, explain why and suggest whether to retry or stop

CONSTRAINTS
- Never guess MCP tool input schemas — they are resolved at runtime
- Never hallucinate artifact content — you orchestrate, you do not generate
- For general questions, answer directly without invoking skills
- Current workspace: {workspaceId}
- Current session: {sessionId}
```

---

## 6. ExecutionCore — The Step Loop

```typescript
async function executeStep(step: PlanStep, state: RunState): Promise<StepResult>
```

Each step is routed based on the skill's `domain` and `is_artifact_skill` flag. There are three execution branches.

### Branch A — ASTRA artifact skill (`domain: 'astra'`)

Full three-phase execution, identical to the Python conductor model:

**Phase 1 — discover:** Invoke the skill via `McpInvoker` or `LlmInvoker`. The result is a set of `StagedArtifact` objects. A discovery failure terminates the run immediately — `RunRecorder` marks the run `failed` and the step loop exits.

**Phase 2 — enrich (diagram):** For each staged artifact, invoke `sk.diagram.mermaid` via `McpInvoker` to generate Mermaid diagrams. Non-fatal — failure is logged and the step continues.

**Phase 3 — narrative_enrich:** For each staged artifact, call Claude directly with the artifact JSON and the kind's `narratives_spec` to generate a Markdown narrative. Non-fatal.

After all three phases, `ArtifactPersister` batch-upserts the enriched artifacts to `workspace-manager-service` (MongoDB). `RunRecorder` marks the step complete in `learning-service`.

### Branch B — General skill, file-producing (`domain: 'general'`, `raw_artifact_envelope` defined)

Lightweight execution:

1. Invoke the skill via `McpInvoker`.
2. Extract the file payload from the tool result using `raw_artifact_envelope` (base64 content or URL).
3. `RawArtifactUploader` uploads the file to `workspace-manager-service` S3 endpoint.
4. The service returns an S3 key and a pre-signed download URL.
5. The agent streams a file reference card back to the renderer as conversational content.
6. No enrichment phases. No MongoDB persistence.

### Branch C — General skill, conversational (`domain: 'general'`, no `raw_artifact_envelope`)

Minimal execution:

1. Invoke the skill via `McpInvoker`.
2. Return the tool result directly to Claude as a `tool_result` message.
3. Claude narrates the result conversationally.
4. No persistence of any kind.

### Branch selection logic

```typescript
if (skill.domain === 'astra') {
  // Branch A — full three-phase ASTRA pipeline
} else if (skill.domain === 'general' && skill.raw_artifact_envelope) {
  // Branch B — raw file upload to S3
} else {
  // Branch C — conversational tool result only
}
```

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
- Streams or polls for async tool results.
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
| `run:cancelled` | `{ runId }` | Run cancelled by user |
| `agent:ask_user` | `{ token, question, input_type, options? }` | Mid-run input request |
| `agent:raw_artifact_uploaded` | `{ s3Key, downloadUrl, mimeType, filename }` | File uploaded to S3 |
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

If the Electron app crashes or restarts mid-session, the conversation history is fully recoverable from `session-svc`.

### Skill manifest cache invalidation

The in-memory skill manifest cache (TTL 5 min) is supplemented by a WebSocket listener on `notification-service`. When `skill-registry-service` publishes a `skill.updated` or `skill.created` event to RabbitMQ → `notification-service`, the Electron app's WebSocket listener receives it and immediately invalidates the in-memory cache.

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

One active run per workspace. Multiple concurrent workspaces, each with one active run, is fully supported.

---

## 13. Skill Domain Model — ASTRA vs General

### SkillDocument additions

```typescript
type SkillDomain = 'astra' | 'general';

interface SkillDocument {
  // ... existing fields ...
  domain: SkillDomain;
  is_artifact_skill: boolean;             // true → produces a registerable artifact
  raw_artifact_envelope?: RawArtifactEnvelope; // defined for file-producing general skills
}

interface RawArtifactEnvelope {
  content_type: 'base64' | 'url';
  mime_type: string;                      // e.g. "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  filename_template: string;              // e.g. "{workspace_id}_{run_id}_output.docx"
}
```

All existing ASTRA skills are `domain: 'astra'`, `is_artifact_skill: true`. Non-ASTRA skills registered by users are `domain: 'general'` with `is_artifact_skill` and `raw_artifact_envelope` set during onboarding.

### Two-pass manifest scoping in IntentStrategy

`IntentStrategy` does not hand Claude every registered skill. It builds a scoped tool list:

**Pass 1 (default scope):** Load only `domain: 'astra'` skills filtered to the workspace's product tag (RAINA, Neozeta, SABA). This is the correct scope for the vast majority of runs and keeps the tool list tight.

**Pass 2 (widened scope):** If Claude's Pass 1 response contains no tool calls and the user message contains file-production or external-API intent signals ("write", "generate", "create a document", "fetch from GitHub", etc.), `IntentStrategy` re-runs with `domain: 'general'` skills added to the tool list. This is a second `anthropic.messages.stream()` call with the extended definitions.

If Pass 2 also produces no tool calls, the response is treated as a general-purpose conversational answer.

```typescript
async function buildToolList(workspaceTag: string, includeGeneral: boolean): Promise<AnthropicTool[]> {
  const manifest = await skillRegistryClient.getPublished();
  const astraSkills = manifest.filter(s => s.domain === 'astra' && s.tags.includes(workspaceTag));
  const generalSkills = includeGeneral ? manifest.filter(s => s.domain === 'general') : [];
  return [...astraSkills, ...generalSkills, ASK_USER_TOOL, INVOKE_SKILL_PACK_TOOL]
    .map(toAnthropicToolDefinition);
}
```

### Skill registration — onboarding wizard domain question

When a user registers a new skill, the onboarding wizard adds one question before the existing steps:

> **What does this skill produce?**  
> ○ An ASTRA artifact — structured, workspace-tracked, schema-governed  
> ○ A file — document, image, spreadsheet, or other binary output  
> ○ Conversational output only — no file or artifact produced

The answer sets `domain`, `is_artifact_skill`, and whether to prompt for `raw_artifact_envelope` fields (mime type, filename template). The remainder of the wizard (MCP server connection, tool selection, LLM inference, registration) is unchanged.

---

## 14. Raw Artifact Storage — S3

### Workspace provisioning

`workspace-manager-service` receives `platform.workspace.created` events from RabbitMQ. Its existing handler creates the MongoDB document in `workspace_artifacts`. It now also provisions S3 storage as a side effect of the same handler.

**Storage model: one bucket, workspace_id as key prefix.**

Creating one S3 bucket per workspace hits AWS's account-level bucket limits quickly. The correct model is a single shared bucket with workspace-scoped key prefixes:

```
s3://astra-raw-artifacts/
  {workspace_id}/
    {run_id}/
      {timestamp}_{filename}
```

This gives the same tenancy isolation without bucket proliferation. IAM policies enforce prefix-scoped access per workspace. The `workspace_id` is the tenant key.

### New endpoints on workspace-manager-service

```
POST   /raw-artifact/{workspaceId}           Upload a raw artifact (multipart or base64 body)
GET    /raw-artifact/{workspaceId}           List raw artifacts for the workspace
GET    /raw-artifact/{workspaceId}/{key}     Get pre-signed download URL for a specific artifact
DELETE /raw-artifact/{workspaceId}/{key}     Soft-delete a raw artifact
```

Upload response:

```typescript
interface RawArtifactUploadResponse {
  s3_key: string;
  download_url: string;       // pre-signed, TTL configurable
  workspace_id: string;
  run_id: string;
  mime_type: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}
```

### RawArtifactUploader in the agent

```typescript
class RawArtifactUploader {
  async upload(
    workspaceId: string,
    runId: string,
    envelope: RawArtifactEnvelope,
    toolResult: unknown,
    signal: AbortSignal
  ): Promise<RawArtifactUploadResponse>
}
```

The uploader extracts the file payload from the MCP tool result per `envelope.content_type`:

- `base64` — decodes the string field, constructs a multipart upload body.
- `url` — fetches the URL and streams the response body to the upload endpoint.

The upload response is streamed to the renderer as an `agent:raw_artifact_uploaded` event, which renders a file card inline in the chat with a download button.

### Event publishing

When `workspace-manager-service` completes a raw artifact upload, it publishes:

```json
{
  "routing_key": "{workspaceId}.workspace.raw_artifact.created",
  "workspace_id": "{workspaceId}",
  "run_id": "{runId}",
  "s3_key": "...",
  "mime_type": "...",
  "filename": "...",
  "size_bytes": 0
}
```

The notification-service broadcasts it to the workspace WebSocket channel. The Electron app's activity feed shows the new file alongside ASTRA artifact events.

---

## 15. Electron App Stack

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

---

## 16. Open Questions — Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Should intent-driven run logs include the full skill reasoning chain, or only artifact provenance? | Store the full Claude tool-use reasoning chain in `session-svc` as a separate `reasoning_trace` field. Not included in `messages` — conversation replay stays clean. |
| 2 | Skill manifest cache invalidation strategy when `SKILL.md` body changes but frontmatter does not? | In-memory TTL of 5 min as baseline, supplemented by WebSocket listener on `notification-service` reacting to `skill.updated` / `skill.created` events for immediate invalidation. |
| 3 | How many concurrent runs should the Astra Agent support per Electron app instance? | One active run per workspace. Multiple concurrent workspaces, each with one run, is supported. |
| 4 | Strategy for keeping `sk.*` skills in sync with `cap.*` counterparts when a capability is updated | Out of scope for this phase. |

---

## 17. ADR Cross-Reference

| ADR | Title | How this design implements it |
|---|---|---|
| ADR-009 | Unified Astra Agent in the Electron Desktop Frontend | `AgentController` is the single TypeScript agent; planner/conductor distinction eliminated |
| ADR-011 | MCP integration via skill frontmatter; one tool per skill enforced | `McpInvoker` resolves tool schema at runtime via `tools/list`; `SkillDocument.execution.tool_name` is a single string |
| ADR-012 | LLM agnosticism deferred at the orchestration layer | Claude (`@anthropic-ai/sdk`) is the explicit dependency in `IntentStrategy`; acknowledged and deferred |
| ADR-013 | Unified conversational streaming across all run modes | `Streamer` uses the same token + event fan-out for all run modes including general conversation |
| ADR-015 | General-purpose tool invocation and skill domain model | Skill `domain` field, two-pass manifest scoping, three-branch `ExecutionCore` routing |
| ADR-016 | Raw artifact S3 storage and workspace provisioning | S3 prefix-per-workspace, `workspace-manager-service` extended, `RawArtifactUploader` in agent |

---

## 18. ADR-015 — General-Purpose Tool Invocation and Skill Domain Model

**Status:** Accepted  
**Date:** March 2026

### Context

The Astra Agent was initially designed as a pure ASTRA knowledge-generation orchestrator. Users need the agent to also handle general conversations, invoke non-ASTRA MCP tools (GitHub, Slack, document generators), and produce non-ASTRA file outputs — all within the same conversational interface and workspace context.

Simply adding non-ASTRA skills to the existing skill manifest would pollute the tool list for every ASTRA run, increase token cost, and route non-ASTRA tool results through a persistence pipeline that is not appropriate for them.

### Decision

**1. The agent is a general-purpose assistant first.** Claude responds to conversational, analytical, and technical questions directly without invoking any skill. The system prompt makes this explicit. No tool call is required for a conversational response.

**2. A `domain` field is added to `SkillDocument`** with values `'astra'` and `'general'`. All existing ASTRA skills are `domain: 'astra'`. Non-ASTRA skills registered by users are `domain: 'general'`.

**3. `IntentStrategy` uses two-pass manifest scoping.** Pass 1 presents only `domain: 'astra'` skills scoped to the workspace product tag. Pass 2 widens to include `domain: 'general'` skills if Pass 1 produces no tool calls and the message contains file-production or external-API intent signals. This keeps the default tool list tight without permanently excluding general skills.

**4. `ExecutionCore` routes steps by domain and `is_artifact_skill`.** Three branches: full ASTRA three-phase pipeline, raw S3 file upload, or conversational tool result only. The branching is driven entirely by the skill's own declaration — `ExecutionCore` never guesses.

**5. The onboarding wizard adds a domain selection step.** Users registering a new skill declare whether it produces an ASTRA artifact, a raw file, or conversational output. This sets `domain`, `is_artifact_skill`, and `raw_artifact_envelope`.

### Consequences

- General conversations work without any skill invocation. The agent degrades gracefully to a plain LLM conversation when no skills are relevant.
- Non-ASTRA MCP tools are first-class citizens in the skill registry and the agent, without polluting the ASTRA execution pipeline.
- Token cost for ASTRA runs is unaffected — Pass 1 presents only the relevant ASTRA skills.
- Two API calls to Claude occur in the widening case (Pass 1 + Pass 2). This is acceptable — the widening path is the exception, not the rule.
- All three execution branches share the same `McpInvoker` and `RunRecorder`. Only persistence and enrichment differ. No code duplication.

---

## 19. ADR-016 — Raw Artifact S3 Storage and Workspace Provisioning

**Status:** Accepted  
**Date:** March 2026

### Context

Non-ASTRA skills (document generators, image renderers, report writers) produce binary or markdown files that are not ASTRA-governed artifacts. These cannot be stored in the `workspace_artifacts` MongoDB collection — they have no `cam.*` kind, no JSON schema, no ETag versioning, and no enrichment pipeline.

Users expect files produced by the agent to be accessible from the workspace after the run completes, persisted across sessions, and downloadable from the Electron UI.

### Decision

**1. `workspace-manager-service` owns raw artifact storage** in addition to ASTRA artifact storage. Extending the existing service is preferred over a new dedicated service — workspace provisioning logic stays in one place, and the service already owns the workspace lifecycle event consumer.

**2. Storage model: one S3 bucket, `workspace_id` as key prefix.** One bucket per workspace would hit AWS account-level bucket limits at scale. The prefix model provides equivalent tenancy isolation:

```
s3://astra-raw-artifacts/{workspace_id}/{run_id}/{timestamp}_{filename}
```

The `workspace_id` is the tenant key. IAM policies enforce prefix-scoped access.

**3. `workspace-manager-service` extends its `workspace.created` handler** to provision the S3 prefix as a side effect alongside creating the MongoDB workspace document. No new service is introduced for this provisioning.

**4. Four new REST endpoints are added to `workspace-manager-service`**: upload, list, get pre-signed URL, and soft-delete. These are under `/raw-artifact/...` paths, clearly separated from the existing ASTRA artifact endpoints at `/artifact/...`.

**5. A `workspace.raw_artifact.created` event is published** to RabbitMQ on successful upload, routed via `notification-service` to the workspace WebSocket channel. This enables the Electron activity feed and any future consumers.

**6. The agent's `RawArtifactUploader`** handles both `base64` and `url` content types from MCP tool results, keyed by `raw_artifact_envelope` on the skill declaration.

### Consequences

- Raw artifacts are workspace-scoped and tenant-isolated using the same `workspace_id` boundary as ASTRA artifacts.
- No new service is required for Phase 3 of the build plan — `workspace-manager-service` absorbs the change.
- The two artifact tracks (MongoDB ASTRA artifacts, S3 raw artifacts) are clearly separated at the API, storage, and agent execution levels. They share only the `workspace_id` as a common key.
- Raw artifacts and ASTRA artifacts for the same run are cross-referenceable via `run_id` in the S3 key, enabling provenance queries later.
- S3 costs are incurred for all file-producing general skills. Large binary files should be gated at the skill registration level via a `raw_artifact_envelope.max_size_bytes` field (to be added in a future revision).
