# ASTRA Skill-Based Architecture — Documentation

**Branch:** `feature/skill-based-architecture`  
**Last Updated:** March 2026

This directory contains the architecture documentation for the skill-based evolution of ASTRA. Skills and capabilities **coexist** — neither replaces the other. The skill path is a new parallel track served by a new Electron desktop frontend and the Astra Agent.

---

## Documents

| File | Description |
|---|---|
| [`architecture-skill-based-astra.md`](./architecture-skill-based-astra.md) | Full architecture document. Covers the coexistence model, core concepts, Astra Agent, seed strategy, frontend split, service inventory, data models, and build phases. |
| [`architecture-diagrams.html`](./architecture-diagrams.html) | Interactive HTML with Mermaid diagrams: coexistence model, service topology, Astra Agent model, intent-driven run, pack-driven run, skill anatomy, and migration timeline. Open in a browser. |
| [`astra_skill_architecture.docx`](../astra_skill_architecture.docx) | Full architecture design document including ADRs 007–014. Primary reference document. |

---

## Key Decisions at a Glance

| Decision | Detail |
|---|---|
| Skills coexist with capabilities | No deprecation. `cap.*` and `sk.*` run side by side. |
| Skill naming | `sk.<group>.<action>` — e.g. `sk.asset.fetch_raina_input` |
| Capability naming | `cap.<group>.<action>` — unchanged |
| Artifact kinds | Shared — `cam.*` identifiers used by both paths |
| Skill frontend | New Electron desktop app — Cowork-style UX |
| Capability frontend | VSCode extension — unchanged |
| Astra Agent | TypeScript, in-process in Electron app |
| Capability agents | planner-service + conductor-service — unchanged Python backend |
| Skill seed data | Converted from capability seed files (`cap.*` → `sk.*`) |
| One tool per skill | `execution.tool_name` is a single string, not an array |
| Shared backend | artifact-service, workspace-manager-service, workspace-service, learning-service, notification-service, config-forge |

---

## Namespace Summary

| Prefix | Meaning | Registry | Frontend |
|---|---|---|---|
| `sk.*` | Skill | skill-registry-service (:9028) | Electron app |
| `cap.*` | Capability | capability-service (:9021) | VSCode extension |
| `cam.*` | Artifact Kind | artifact-service (:9020) | Both |

---

## ADR Summary

| ADR | Title | Status |
|---|---|---|
| ADR-007 | Skills coexist with Capabilities — additive, not replacement | Accepted |
| ADR-008 | `sk.<group>.<action>` naming convention for skills | Accepted |
| ADR-009 | Unified Astra Agent in the Electron Desktop Frontend | Accepted |
| ADR-010 | Introduce skill-registry-service and session-svc | Accepted |
| ADR-011 | MCP integration via skill frontmatter; one tool per skill enforced | Accepted |
| ADR-012 | LLM agnosticism deferred at the orchestration layer | Deferred |
| ADR-013 | Unified conversational streaming across all run modes | Accepted |
| ADR-014 | Seed skill-registry-service from capability seed data | Accepted |
