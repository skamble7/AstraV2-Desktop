# ASTRA Skill-Based Architecture

**Branch:** `feature/skill-based-architecture`  
**Status:** Proposed  
**Authors:** Astra Platform Team  
**Last Updated:** March 2026

---

## 1. Overview

This document describes the additive architectural evolution of ASTRA that introduces **Skills** and **Skill Packs** alongside the existing **Capabilities** and **Capability Packs**. Skills and capabilities coexist — neither replaces the other.

The change is delivered through two parallel tracks:

1. **A new `skill-registry-service`** that manages skills and skill packs as first-class entities, seeded from the existing capability seed data with `sk.*` identifiers.
2. **A new Electron desktop frontend** that provides a Cowork-style conversational experience driven exclusively by skills, skill packs, and the Astra Agent. The existing VSCode extension continues unchanged, handling capabilities only.

Artifact Kinds, workspace management, and artifact storage remain shared infrastructure used by both the capability path and the skill path.

---

## 2. Coexistence Model

Skills and capabilities are parallel execution primitives that share backend infrastructure but are otherwise independent.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Shared Infrastructure                       │
│                                                                     │
│   artifact-service (:9020)        workspace-service (:8010)        │
│   workspace-manager-service (:9027)   config-forge (:8040)         │
│   learning-service (:9022)        notification-service (:8016)     │
└───────────────────┬─────────────────────────┬───────────────────────┘
                    │                         │
       ┌────────────▼──────────┐   ┌──────────▼────────────┐
       │  Capability Path      │   │  Skill Path (NEW)     │
       │  (unchanged)          │   │                       │
       │                       │   │  skill-registry-svc   │
       │  capability-service   │   │  :9028                │
       │  :9021                │   │                       │
       │  planner-service      │   │  session-svc          │
       │  :9025                │   │  :9029                │
       │  conductor-service    │   │                       │
       │  :9022                │   │  Astra Agent (TS)     │
       │  onboarding-svc       │   │  in Electron frontend │
       │  :9026                │   │                       │
       └────────────┬──────────┘   └──────────┬────────────┘
                    │                         │
       ┌────────────▼──────────┐   ┌──────────▼────────────┐
       │  VSCode Extension     │   │  Electron Desktop App │
       │  (unchanged)          │   │  (NEW)                │
       │  Handles capabilities │   │  Handles skills only  │
       │  only                 │   │  Cowork-style UX      │
       └───────────────────────┘   └───────────────────────┘
```

### What is shared

- **artifact-service (:9020)** — kind registry, schema validation, build-envelope. Used by both paths.
- **workspace-manager-service (:9027)** — artifact storage, CRUD, version history. Used by both paths.
- **workspace-service (:8010)** — workspace CRUD. Used by both paths.
- **learning-service (:9022)** — run records and step state. Used by both paths.
- **notification-service (:8016)** — workspace-broadcast events. Used by both paths.
- **config-forge (:8040)** — LLM configuration. Used by both paths.

### What is capability-only (unchanged)

capability-service (:9021), planner-service (:9025), conductor-service (:9022), capability-onboarding-service (:9026), VSCode extension frontend.

### What is skill-only (new)

skill-registry-service (:9028), session-svc (:9029), Astra Agent (TypeScript, Electron frontend), Electron desktop frontend.

---

## 3. Core Concepts

### 3.1 Artifact Kind — Unchanged and Shared

Artifact kinds remain the stable, versioned, schema-governed output contract. They are fully shared between the capability path and the skill path. An artifact produced by either path is an instance of the same registered kind, governed by the same schema, diagram recipes, and narratives spec.

```
cam.<category>.<n>
e.g. cam.agile.user_story, cam.architecture.service_contract
```

---

### 3.2 Skill — New, Coexists with Capability

A **Skill** is a declarative, addressable unit of execution registered in the skill-registry-service. It coexists with — and does not replace — `GlobalCapability`. A skill is a folder containing a `SKILL.md` entry point and optional bundled resources.

```
sk.asset.fetch_raina_input/
├── SKILL.md          ← required: frontmatter + instructions
├── references/       ← optional: domain-specific reference docs
└── assets/           ← optional: templates, schemas, fixtures
```

#### Naming convention

Skills use the `sk.<group>.<action>` namespace. This is distinct from the `cap.<group>.<action>` namespace used by capabilities. The two namespaces never overlap — a `sk.*` identifier always refers to a skill; a `cap.*` identifier always refers to a capability.

```
sk.asset.fetch_raina_input    ← skill
cap.asset.fetch_raina_input   ← capability (unchanged, in capability-service)
```

Both produce `cam.asset.raina_input` — the same artifact kind.

#### SKILL.md frontmatter

```yaml
---
name: sk.asset.fetch_raina_input
version: 1.0.0
status: published
tags: [inputs, raina, discovery, mcp]

description: >
  Fetches a Raina input document (AVC, FSS, or PSS format) from a
  URL endpoint and emits a validated cam.asset.raina_input artifact.
  Use this skill when a workspace run requires architecture discovery
  inputs and a URL pointing to an AVC/FSS/PSS JSON payload is
  available. This is typically the first skill invoked in any
  RAINA-domain run — no upstream artifacts are required.

produces_kinds:
  - cam.asset.raina_input

depends_on: []

execution:
  mode: mcp
  transport: http
  base_url: "${RAINA_INPUT_FETCHER_URL}"
  protocol_path: /mcp
  health_path: /health
  tool_name: raina.input.fetch
  timeout_sec: 180
  verify_tls: false
  retry:
    max_attempts: 2
    backoff_ms: 250
    jitter_ms: 50
  headers:
    host: "${RAINA_INPUT_FETCHER_HOST}"
  auth:
    method: none
---
```

**One tool per skill.** The `execution.tool_name` field is a single string — not an array. Each skill invokes exactly one MCP tool and produces exactly one family of artifact kinds. This is a hard constraint: if a capability currently declares multiple `tool_calls`, each tool becomes a separate skill with its own `sk.*` identifier.

**Tool input schema not embedded.** Input schemas are resolved at runtime via `tools/list` on the MCP server — never stored in the skill declaration.

**Auth uses alias-based env var names.** Raw secrets are never stored in skill declarations.

---

### 3.3 Skill Pack — New, Coexists with Capability Pack

A **Skill Pack** is a versioned, deterministic bundle of skills with an explicit playbook. It coexists with — and does not replace — `CapabilityPack`. Skill pack `skill_ids` arrays contain only `sk.*` identifiers.

```yaml
key: neozeta.legacy.learn
version: 1.2.0
title: Learn a Legacy Application
skill_ids:
  - sk.cobol.copybook.parse
  - sk.cobol.jcl.parse
  - sk.legacy.workflow.discover
agent_skill_ids:
  - sk.diagram.mermaid
  - sk.narrative.generate
pack_input_id: pi.neozeta.legacy
playbook:
  steps:
    - skill_id: sk.cobol.copybook.parse
    - skill_id: sk.cobol.jcl.parse
    - skill_id: sk.legacy.workflow.discover
status: published
```

---

## 4. Astra Agent — Electron Frontend

The Astra Agent is a TypeScript agent running inside the new **Electron desktop application**. It handles all skill execution — both intent-driven runs (Claude reasoning over registered skills) and pack-driven runs (playbook execution). It does not interact with capabilities, capability packs, the capability-service, or the VSCode extension.

```
┌────────────────────────────────────────────────────────────┐
│  Electron Desktop App                                      │
│                                                            │
│  ┌──────────────────────┐  ┌───────────────────────────┐  │
│  │ Intent Plan Strategy │  │ Pack Plan Strategy        │  │
│  │ LLM reasoning over   │  │ Read sk pack playbook     │  │
│  │ registered sk.* skills│  │ No LLM for plan acq.     │  │
│  └──────────┬───────────┘  └─────────────┬─────────────┘  │
│             └─────────────┬──────────────┘                │
│                           ▼                               │
│            ┌──────────────────────────────┐               │
│            │   Shared Execution Core      │               │
│            │   • Plan → Approve → Run     │               │
│            │   • Skill resolution (sk.*)  │               │
│            │   • MCP invocation           │               │
│            │   • Enrichment phases        │               │
│            │   • Artifact persistence     │               │
│            │   • Conversational streaming │               │
│            │   • Session management       │               │
│            │   • Cancellation             │               │
│            └──────────────┬───────────────┘               │
│                     Anthropic SDK (TS)                    │
│                     stream() — direct SSE                 │
└─────────────────────────┬──────────────────────────────────┘
                          │ HTTPS
                          ▼
                   Anthropic API (Claude)
```

### 4.1 Intent-Driven Run

The user expresses a natural language intent. The agent loads the skill manifest from skill-registry-service (`sk.*` skills only) and uses Claude's LLM reasoning to select and sequence skills. Skills are presented as Anthropic tool definitions derived from their `SKILL.md` frontmatter.

### 4.2 Pack-Driven Run

The user selects a Skill Pack. The plan is read directly from the pack's playbook — no LLM reasoning for plan acquisition. The same execution core then runs it.

### 4.3 Streaming

Both run modes use the same conversational streaming character — token-by-token via the Anthropic SDK SSE, rendered directly in the Electron UI. Step and run lifecycle events are published to notification-service for the activity feed.

### 4.4 Session Persistence

The Astra Agent persists conversation history to session-svc (:9029) at `message_stop`. This survives Electron app restarts.

---

## 5. Seed Data Strategy

The skill-registry-service is seeded from the existing capability seed files in capability-service. The conversion produces a lean MongoDB document — only the four fields the manifest cache needs at the top level, with the complete `SKILL.md` stored as `skill_md_body`.

### 5.1 MongoDB Document Fields

| MongoDB field | Source | Notes |
|---|---|---|
| `name` | `cap.x.y.z` → `sk.x.y.z` | Prefix `cap.` → `sk.`. Same group and action. |
| `description` | capability `description` | Enriched with "when to use" context via LLM pass. |
| `domain` | Derived | `"astra"` for all ASTRA capability conversions. |
| `is_artifact_skill` | Derived | `true` for all ASTRA capability conversions. |
| `skill_md_body` | Generated | Complete SKILL.md including frontmatter + body. |

### 5.2 SKILL.md Frontmatter Mapping

The `skill_md_body` frontmatter encodes all execution detail. Capability fields map as follows:

| Capability field | SKILL.md frontmatter | Notes |
|---|---|---|
| `id: cap.x.y.z` | `name: sk.x.y.z` | Prefix `cap.` → `sk.` |
| `description` | `description` | Enriched with "when to use" context. |
| `tags` | `tags` | Direct copy. |
| `produces_kinds` | `produces_kinds` | Direct copy — same `cam.*` kind IDs. |
| `execution.mode` | `execution.mode` | Direct copy. |
| `execution.transport.kind` | `execution.transport` | Flattened (`http`/`stdio`). |
| `execution.transport.base_url` | `execution.base_url` | Hardcoded URL → `${ENV_VAR}` reference. |
| `execution.transport.protocol_path` | `execution.protocol_path` | Direct copy. |
| `execution.tool_name` | `execution.tool_name` | Direct copy (already flat string). |
| `execution.transport.auth: null` | `execution.auth.method: none` | Explicit null → `method: none`. Null alias fields omitted. |
| `execution.transport.timeout_sec` | `execution.timeout_sec` | Direct copy. |
| `execution.transport.verify_tls` | `execution.verify_tls` | Direct copy. |
| `execution.transport.headers` | `execution.headers` | Values converted to `${ENV_VAR}` references. |
| `parameters_schema` | `parameters_schema` | Omit if null. |
| `status` | `status` | Direct copy. |
| *(none)* | `version: 1.0.0` | Default for all converted skills. |
| *(none)* | SKILL.md body | Generated by LLM from description + tool schema. |
| `tool_calls[].args_schema` | Removed | Resolved at runtime via `tools/list`. |

**One-tool enforcement.** If a capability has more than one entry in `tool_calls`, it is split into multiple skills — one `sk.*` skill per tool call. Flagged for manual review during conversion.

**Env var substitution.** Hardcoded base URLs and header values are never stored in skill documents. They are replaced with `${ENV_VAR}` references resolved by the Astra Agent at invocation time.

---

## 6. Frontend Split

| Concern | VSCode Extension (existing) | Electron Desktop App (new) |
|---|---|---|
| Execution primitives | Capabilities (`cap.*`) | Skills (`sk.*`) |
| Composition | Capability Packs | Skill Packs |
| Agent | planner-service + conductor-service (Python, backend) | Astra Agent (TypeScript, in-process) |
| Streaming | WebSocket relay via Python backend | Direct SSE — Anthropic SDK |
| UX style | Existing Astra VSCode UX | Cowork-style conversational shell |
| Registries used | capability-service (:9021) | skill-registry-service (:9028) |
| Shared services | artifact-service, workspace-manager-service, workspace-service, learning-service, notification-service, config-forge | Same |
| Status | Unchanged | New — this branch |

---

## 7. Service Inventory

### 7.1 Unchanged Services

| Service | Port | Notes |
|---|---|---|
| `capability-service` | 9021 | Unchanged. Owns `cap.*` registrations. |
| `planner-service` | 9025 | Unchanged. Python / LangGraph. |
| `conductor-service` | 9022 | Unchanged. Python / LangGraph. |
| `capability-onboarding-service` | 9026 | Unchanged. |
| `artifact-service` | 9020 | Shared. Kind registry only. |
| `workspace-manager-service` | 9027 | Shared. Artifact storage. |
| `workspace-service` | 8010 | Shared. Workspace CRUD. |
| `learning-service` | 9022 | Shared. Run records. |
| `notification-service` | 8016 | Shared. Broadcast events. |
| `config-forge` | 8040 | Shared. LLM config. |

### 7.2 New Services

| Service | Port | Responsibility |
|---|---|---|
| `skill-registry-service` | 9028 | Owns `sk.*` skill and skill pack storage, retrieval, skill manifest cache (Redis-backed). Seeded from capability seed data. |
| `session-svc` | 9029 | Thin key-value store for Astra Agent conversation history. Survives Electron app restarts. |

---

## 8. Data Models

### 8.1 Skill Document

The MongoDB document is deliberately lean. Only the fields the manifest cache and
agent routing logic need are stored as top-level BSON fields. Everything else —
execution config, produces_kinds, depends_on, tags, version, auth, retry, references
— lives inside `skill_md_body` as the complete `SKILL.md` content (frontmatter +
body). The agent parses the frontmatter at invocation time.

```typescript
interface SkillDocument {
  _id: ObjectId;
  name: string;              // sk.<group>.<action> — indexed, unique
  description: string;       // natural language — used to build manifest cache
  domain: 'astra' | 'general'; // astra = ASTRA artifact pipeline
                             //  general = raw file or conversational output
  is_artifact_skill: boolean; // true  → full three-phase execution pipeline
                             //  false → tool result returned as conversational content
  skill_md_body: string;     // complete SKILL.md (frontmatter + body) — source of truth
  created_at: Date;
  updated_at: Date;
}
```

**Why `skill_md_body` is the source of truth.** Storing execution config, tags,
produces_kinds, and other frontmatter fields both inside `skill_md_body` and as
separate top-level BSON fields creates two sources of truth that can drift.
The lean model avoids this entirely — the agent parses the SKILL.md frontmatter
when it loads a skill for invocation.

**Why `name`, `description`, `domain`, and `is_artifact_skill` are top-level.**
The manifest cache endpoint must serve lightweight entries without parsing YAML
for every skill on every request. These four fields are the only ones the agent
needs before deciding to invoke a skill.

**Manifest cache entry** (served by `GET /skills/manifest`):

```typescript
interface SkillManifestEntry {
  name: string;
  description: string;
  domain: 'astra' | 'general';
  is_artifact_skill: boolean;
}
```

**Full skill load** (served by `GET /skills/{name}`): returns the complete
`SkillDocument` including `skill_md_body`. The agent parses the frontmatter
YAML to extract `execution`, `produces_kinds`, `depends_on`, etc. at invocation time.

### 8.2 Skill Pack Document

```typescript
interface SkillPackDocument {
  key: string;
  version: string;
  title: string;
  description: string;
  skill_ids: string[];                 // sk.* identifiers only
  agent_skill_ids?: string[];          // sk.* enrichment skills
  pack_input_id?: string;
  playbook: Playbook;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}
```

### 8.3 Session Document

```typescript
interface SessionDocument {
  session_id: string;
  workspace_id: string;
  messages: AnthropicMessage[];
  created_at: string;
  updated_at: string;
}
```

---

## 9. Skill Authoring Guide

### Naming

Use `sk.<group>.<action>` — the same group/action taxonomy as capabilities but with the `sk.` prefix. Examples: `sk.cobol.copybook.parse`, `sk.asset.fetch_raina_input`, `sk.diagram.mermaid`.

### Description Quality

Descriptions drive the Astra Agent's skill selection in intent-driven runs. They must be specific about **when** to use the skill, not just **what** it does:

```yaml
# Too vague:
description: Fetches a Raina input document.

# Correct:
description: >
  Fetches a Raina input document (AVC, FSS, or PSS format) from a
  URL endpoint and emits a validated cam.asset.raina_input artifact.
  Use when a workspace run requires architecture discovery inputs and
  a URL pointing to an AVC/FSS/PSS JSON payload is available. This
  is typically the first skill invoked in any RAINA-domain run —
  no upstream artifacts are required.
```

### One Tool Per Skill

Each skill must declare exactly one `execution.tool_name`. If an MCP server exposes multiple tools that are logically distinct, register a separate skill for each tool.

### Progressive Disclosure

Keep `SKILL.md` under 500 lines. Move deep reference material into `references/` and reference explicitly from the body.

---

## 10. Build Phases

| Phase | Description |
|---|---|
| 1 — skill-registry-service | Build and deploy skill-registry-service (:9028). Seed with converted capability seed data (`cap.*` → `sk.*`). |
| 2 — session-svc | Build and deploy session-svc (:9029). |
| 3 — Astra Agent core | Implement the TypeScript Astra Agent in the Electron app. Intent-driven run mode first. |
| 4 — Pack-driven run | Implement pack-driven run mode in the Astra Agent. |
| 5 — Electron UX | Build the Cowork-style Electron frontend shell with full UX (home, workspaces, conversation, artifacts). |
| 6 — Skill onboarding | Build skill registration flow in the Electron app (sk.* equivalent of the VSCode onboarding wizard). |

---

## 11. Open Questions

1. Should intent-driven run logs include the full skill reasoning chain, or only artifact provenance?
2. Skill manifest cache invalidation strategy when `SKILL.md` body changes but frontmatter does not?
3. How should skill versioning interact with artifact kind versioning?
4. How many concurrent runs should the Astra Agent support per Electron app instance?
5. What is the strategy for keeping `sk.*` skills in sync with their `cap.*` counterparts when a capability is updated?

---

## 12. Key Design Decisions

See `astra_skill_architecture.docx` for the full ADR set:

- **ADR-007:** Skills coexist with Capabilities — additive, not replacement
- **ADR-008:** `sk.<group>.<action>` naming convention for skills
- **ADR-009:** Unified Astra Agent in the Electron Desktop Frontend
- **ADR-010:** Introduce skill-registry-service and session-svc
- **ADR-011:** MCP integration via skill frontmatter; one tool per skill enforced
- **ADR-012:** LLM agnosticism deferred at the orchestration layer
- **ADR-013:** Unified conversational streaming across all run modes
- **ADR-014:** Seed skill-registry-service from capability seed data
- **ADR-015:** Lean skill document model — `skill_md_body` as source of truth
