# ASTRA — UX Specification for Claude Code Implementation

> This document describes the complete frontend UX for the ASTRA Electron desktop application — a domain-agnostic, AI-driven knowledge-generation platform. Use it as the authoritative reference when implementing with Claude Code.
>
> **Branch:** `feature/skill-based-architecture`  
> **Architecture reference:** `architecture-skill-based-astra.md` + `astra_skill_architecture.docx`

---

## 1. Overview

### 1.1 What this app is

This is a **new Electron desktop application** — not the existing VSCode extension. It is a parallel frontend that coexists with the VSCode extension. The two frontends handle entirely different execution primitives:

| Frontend | Execution primitives | Agent |
|---|---|---|
| VSCode Extension (existing, unchanged) | Capabilities (`cap.*`) | Python planner + conductor services |
| **Electron Desktop App (this spec)** | **Skills (`sk.*`)** | **Astra Agent (TypeScript, in-process)** |

The Electron app does **not** interact with capability-service, planner-service, conductor-service, or capability-onboarding-service. It talks to skills only.

### 1.2 Tech stack

- **Shell:** Electron (desktop app, cross-platform)
- **Renderer:** React 19 + TypeScript
- **Styling:** Tailwind CSS v3 + shadcn/ui components
- **State:** Zustand (single global store)
- **Agent:** Astra Agent — TypeScript class running in the Electron main process, using the Anthropic SDK directly (`stream()` SSE, no relay hop)
- **IPC:** Electron `ipcMain` / `ipcRenderer` for renderer ↔ main process communication

### 1.3 Core architectural principle

All internal ASTRA identifiers (`sk.*`, `cam.*`, `cap.*`) are **never shown to the user**. The UI speaks domain language only — e.g. "Ubiquitous Language", not `cam.domain.ubiquitous_language`. Skill IDs, artifact kind IDs, and pack keys are implementation details.

---

## 2. Backend Services Used by This App

The Electron app connects to the following backend services only.

### Skill-path services (new, skill-only)

| Service | Port | Responsibility |
|---|---|---|
| `skill-registry-service` | 9028 | `sk.*` skill and skill pack storage, CRUD, skill manifest cache |
| `session-svc` | 9029 | Conversation history persistence across app restarts |

### Shared infrastructure services

| Service | Port | Responsibility |
|---|---|---|
| `workspace-service` | 8010 | Workspace CRUD |
| `artifact-service` | 9020 | Artifact kind registry, schema validation |
| `workspace-manager-service` | 9027 | Artifact storage, CRUD, version history |
| `learning-service` | 9022 | Run records and step state |
| `notification-service` | 8016 | Workspace-broadcast events |
| `config-forge` | 8040 | LLM configuration |

### Services this app does NOT use

capability-service (:9021), planner-service (:9025), conductor-service (Python, :9022), capability-onboarding-service (:9026).

---

## 3. The Astra Agent

The Astra Agent is a TypeScript class running in the **Electron main process** (not the renderer). It handles all skill execution. All LLM calls go directly from the main process to the Anthropic API via the Anthropic SDK — no backend relay hop.

### Two run modes

**Intent-driven run:** The user types a natural language intent. The agent loads the skill manifest from `skill-registry-service` and uses Claude to reason over `sk.*` skills, select and sequence them, and produce a Plan. Skills are presented to Claude as Anthropic tool definitions derived from their `SKILL.md` frontmatter.

**Pack-driven run:** The user selects a Skill Pack from the dock. The plan is read directly from the pack's playbook — no LLM reasoning for plan acquisition. The same shared execution core then runs it.

### Streaming character

Both run modes use identical streaming: token-by-token SSE via the Anthropic SDK, forwarded from main process to renderer via Electron IPC. The user sees a continuous conversational stream in both cases (ADR-013).

### Plan → Approve → Run flow

Regardless of how a run is triggered, the agent always converges on a **Plan** (ordered list of `sk.*` skill invocations with resolved inputs) before execution begins:
1. Agent produces a Plan and presents it conversationally in chat
2. Agent asks for any required inputs conversationally (no separate form modal)
3. User provides inputs by replying in chat
4. Agent executes the Plan, streaming progress into chat

### Session persistence

Conversation history is persisted to `session-svc (:9029)` at `message_stop`. Sessions survive Electron app restarts, keyed by `session_id` and `workspace_id`.

---

## 4. Design System

- **Font:** System sans-serif (`-apple-system`, `Segoe UI`)
- **Theme:** Dark by default. Light mode toggled via settings popover. All colors via CSS custom properties.
- **Color accents:**
  - Blue `#4a9eff` — primary actions, workspace icons, info
  - Purple `#9d7fe0` — skill packs, intent-driven mode
  - Green `#3dcb7a` — success, domain category
  - Amber `#e6a630` — warnings, narrative representation dot, data category
  - Red `#e05252` — errors, security category
  - Teal `#2ecfa8` — secondary workspace accent
- **Border style:** `0.5px solid` rgba. Cards use `border-radius: 12px`. Nav items use `border-radius: 7px`.
- **No hardcoded hex in components** — use CSS variables throughout.

### Dark mode CSS variables (`:root`)

```css
--bg0: #0f0f10   /* page background */
--bg1: #18181b   /* panels, sidebar, topbar */
--bg2: #1e1e21   /* inputs, nested cards */
--bg3: #27272b   /* hover states, active items */
--bg4: #313135   /* badges, deep nesting */
--t0:  #f0f0f2   /* primary text */
--t1:  #a0a0aa   /* secondary text */
--t2:  #5a5a62   /* muted / labels */
```

### Light mode overrides (`.light` class on `<body>`)

```css
--bg0: #f0f0f3
--bg1: #ffffff
--bg2: #f5f5f8
--bg3: #ebebef
--t0:  #111113
--t1:  #52525a
--t2:  #8e8e96
```

---

## 5. Application Shell

### 5.1 Electron window

Standard Electron window. Min width 1024px, min height 700px. Native OS chrome — no custom titlebar needed.

### 5.2 Global topbar

Present on every screen. Fixed at the top. Height ~49px.

**Left:** ASTRA logomark (blue rounded square, hexagonal SVG) + wordmark "ASTRA" + version badge "v2". Logo click → Home.

**Center (context-sensitive):** Breadcrumb navigation.
- Home: no breadcrumb
- Workspace list: `Home › Workspaces`
- Workspace shell: `Workspaces › [Workspace Name]`
- Artifact detail: `Workspaces › [Workspace Name] › Artifacts`

Each breadcrumb segment is clickable and navigates to the corresponding screen.

**Right:** Two icon buttons — theme toggle (sun/moon icon) and settings (gear icon).

### 5.3 Settings popover

Floating panel (230px wide), anchored below the settings button. Closes on click outside.

Contents:
- Section label: "Appearance"
- Toggle row: "Light mode" + toggle switch. Toggling applies `.light` class to `<body>` and updates the theme icon.

---

## 6. Screen: Home

### Layout

`max-width: 880px` centered, `28px` horizontal padding.

### Greeting

24px heading, weight 600: "Good morning / afternoon / evening" from `new Date().getHours()`. Subtitle: workspace count + last run relative time.

### Get Started cards (2×2 grid)

Each card: 2px top accent bar, colored icon box (30×30px), title, description, stat line, action links.

| Card | Accent | Title | Stat | Link action |
|---|---|---|---|---|
| 1 | Blue | Workspaces | N workspaces · N active runs | `goto('ws-list')` |
| 2 | Purple | Skill registry | N skills · N packs | No-op (future) |
| 3 | Green | Artifact kinds | N kinds · N categories | No-op (future) |
| 4 | Amber | Docs & walkthroughs | N guides · N videos | No-op (future) |

### Lower section (2-column)

**Recent workspaces panel:** 3–5 workspaces. Each row: colored initials icon + name + domain + last updated. Click → open workspace shell. Header has "View all →" → `goto('ws-list')`.

**Recent activity panel:** Read-only event feed. Each row: colored dot + description with bold entity name + timestamp.

---

## 7. Screen: Workspace List

Breadcrumb: `Home › Workspaces`

### Title row

"Your workspaces" (20px, weight 600) + count badge. Right-aligned: grid/list view toggle + "New workspace" button (blue, + icon).

### Filter row

Search input (client-side filter on name + domain) + filter button.

### Workspace grid (3 columns)

Each workspace card:

**Header:** Colored initials icon (32×32px) + workspace name + domain type + three-dot menu (no-op).

**Stats row:** Three stat blocks — Artifacts, Runs, Conversations. Number bold (14px) above muted label.

**Status footer:** Status pip (green=completed, amber=running, gray=idle) + status text + relative time.

Clicking a card opens that workspace's shell.

### New workspace modal

Fields: Workspace name (required) + Domain type (select) + Description (optional).
Actions: Cancel + "Create workspace" (calls `workspace-service POST /workspace/`).

---

## 8. Screen: Workspace Shell

Fills the full viewport below the topbar. Three-column layout:

```
┌─────────────────────┬──────────────────────────────┬──────────────────┐
│  LEFT SIDEBAR       │  CENTER — CHAT               │  RIGHT — CONTEXT │
│  220px fixed        │  flex: 1                     │  268px fixed     │
└─────────────────────┴──────────────────────────────┴──────────────────┘
```

### 8.1 Left sidebar

**Workspace header:** Colored initials dot (24×24px) + workspace name (12px bold) + domain type (10px muted).

**Navigation items:**
- **Artifacts** — badge with count. Click → Artifact Detail screen.
- **Projects** — badge "soon" (amber). Non-functional placeholder.
- **Runs** — badge with count. Placeholder for this iteration.

Active item: slightly lighter background, full-opacity text.

**Conversations section:**
- Section label: "Conversations"
- Scrollable list of conversations for this workspace, loaded from `session-svc` keyed by `workspace_id`. Each item: dot (blue=active, gray=inactive) + truncated title + timestamp.
- Click a conversation → switch active conversation in chat panel.

**Footer:** "New conversation" button (+ icon). Creates a new session in `session-svc`, clears the chat panel.

### 8.2 Center column — Chat

**Skill pack dock** (pinned top):

Label: "Skill pack execution" (10px uppercase muted).

Row below the label:
- **Pack selector** (flex-1): shows selected pack title + version. Mode badge: `declared` (blue). Clicking opens a picker populated from `skill-registry-service GET /skill-packs` (published only). Display pack `title` — never the raw `key`.
- **"Run pack" button** (blue): triggers Astra Agent pack-driven run. Agent asks for required inputs in chat.

**Chat thread** (scrollable, flex-1):

Agent messages: left-aligned, blue "A" avatar, small "ASTRA" from-label above bubble.
User messages: right-aligned, initials avatar.

**Agent message content types:**

1. **Plain text** — conversational response.

2. **Plan box** — inset bordered list inside the bubble after plan assembly:
   - Each row: step number + human-readable step name (never `sk.*` IDs) + status dot (gray=pending, amber=running, green=done, red=failed).
   - If >4–5 steps: collapse remainder as "+N more steps...".

3. **Inline question** — when the agent needs input, it asks in a muted sub-text block at the bottom of the current bubble. User replies in the normal input. **No form modal.** This is the key difference from V1.

**Streaming:** Agent bubble content streams token-by-token via Electron IPC (main → renderer). Tokens append to the current bubble in real time.

**Chat input** (pinned bottom):
- Auto-growing textarea (min 36px, max 80px)
- Send button (blue, arrow icon)
- Hint: "Enter to send · Shift+Enter for new line"

### 8.3 Right column — Artifacts & Context

**Tabs:** "Artifacts" | "Context"

**Artifacts tab (default):** Section label + artifacts grouped by category. Category labels: Domain (green), Architecture (blue), Catalog (purple), Data (amber), Security (red). No internal IDs visible.

Each artifact card: name + one-line summary + file chips (`.md` green, `.docx` blue) + representation dots (amber=narrative, purple=diagram, blue=data).

Clicking a card → Artifact Detail with that artifact pre-selected.

**Context tab:** Empty state with a dashed drop-zone. Drop zone is shown but not wired (future feature).

---

## 9. Screen: Artifact Detail

Breadcrumb: `Workspaces › [Workspace Name] › Artifacts`

Two-panel horizontal split:

```
┌──────────────────────┬──────────────────────────────────────────────┐
│  LEFT — LIST         │  RIGHT — DETAIL                              │
│  280px fixed         │  flex: 1                                     │
└──────────────────────┴──────────────────────────────────────────────┘
```

### 9.1 Left — Artifact list

Header: "All artifacts" + count badge.

Scrollable list. Each item: colored category dot + artifact name (12px bold) + category label (10px muted). No `cam.*` IDs.

Click → selects artifact and loads detail. Active item has light background.

### 9.2 Right — Artifact detail

**Header:** Artifact name (14px bold) + category pill (colored, human-readable) + "Edit" + "Refresh" buttons.

**Representation tab bar:** Narrative (amber dot) | Diagram (purple dot) | Data (blue dot) | Files

Default tab: Narrative.

#### Narrative tab

Card with LLM-generated prose. Content from artifact's `narratives` field via `workspace-manager-service`.

Structure:
- Badge: "Narrative · Developer view"
- H3 section headings, paragraph text, bullet lists — all plain domain language
- Footer: "auto-generated" badge + "Audience: Developer · Version N"

#### Diagram tab

Card with Mermaid diagram source in monospace code block + caption. Content from artifact's `diagrams` field.

Diagram types by category: Domain → mindmap or graph LR; Architecture → graph TD or sequenceDiagram; Catalog → graph LR; Data → graph TD.

#### Data tab

Raw structured JSON of artifact's `data` field. Monospace block with syntax highlighting: keys in blue, strings in green, numbers in amber.

#### Files tab

List of generated files. Each file card: type icon (green=`.md`, blue=`.docx`) + file name + subtitle ("Markdown" or "Word document" + "Generated by ASTRA · v1") + "Download" link (triggers `dialog.showSaveDialog`).

Intro text: "These files were generated from the artifact data by reasoning over the structured output."

Empty state if none: "No generated files for this artifact yet."

---

## 10. Navigation Flow

```
Home
 ├── Workspace List         (Workspaces card → "Open workspaces →")
 │    ├── [click workspace] → Workspace Shell
 │    │    ├── Artifacts nav → Artifact Detail
 │    │    ├── Runs nav     → (placeholder)
 │    │    └── Right panel artifact click → Artifact Detail
 │    └── "New workspace"   → New Workspace Modal
 └── Recent workspace click → Workspace Shell
```

Logo always → Home. Breadcrumb segments navigate to corresponding screen.

---

## 11. Zustand Store Shape

```typescript
interface AstraStore {
  currentScreen: 'home' | 'ws-list' | 'ws' | 'art-detail'
  currentWorkspaceId: string | null
  isLight: boolean
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  conversationsByWorkspace: Record<string, Conversation[]>
  activeConversationId: string | null
  messagesByConversation: Record<string, ChatMessage[]>
  isAgentStreaming: boolean
  skillPacks: SkillPack[]
  selectedPackId: string | null
  artifactsByWorkspace: Record<string, Artifact[]>
  selectedArtifactId: string | null
  activeRepTab: 'narrative' | 'diagram' | 'data' | 'files'
  rightPanelTab: 'artifacts' | 'context'
}
```

---

## 12. Data Models

```typescript
interface Workspace {
  id: string
  name: string
  initials: string
  color: 'blue' | 'purple' | 'green' | 'teal' | 'amber'
  domain: string           // Human-readable
  artifactCount: number
  runCount: number
  conversationCount: number
  status: 'completed' | 'running' | 'idle'
  lastUpdated: string
}

interface SkillPack {
  id: string               // internal key@version — never displayed
  title: string            // Human-readable — always displayed instead of id
  version: string
  description: string
  skillCount: number
  status: 'draft' | 'published' | 'archived'
}

interface Artifact {
  id: string
  name: string             // Human-readable
  category: 'domain' | 'architecture' | 'catalog' | 'data' | 'security'
  summary: string
  narrative: string        // HTML
  diagram: string          // HTML
  data: object             // Raw JSON
  files: GeneratedFile[]
  version: number
  hasNarrative: boolean
  hasDiagram: boolean
}

interface GeneratedFile {
  name: string
  type: 'md' | 'docx'
}

interface Conversation {
  id: string               // session_id from session-svc
  workspaceId: string
  title: string
  lastUpdated: string
  isActive: boolean
}

interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  content: string
  isStreaming?: boolean
  hasPlan?: boolean
  planSteps?: PlanStep[]
  inlineQuestion?: string
}

interface PlanStep {
  number: number
  name: string             // Human-readable — never sk.* IDs
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
}
```

---

## 13. Electron IPC Channels

The Astra Agent runs in the main process. Renderer communicates via these IPC channels:

| Channel | Direction | Payload | Description |
|---|---|---|---|
| `agent:send-message` | renderer → main | `{ sessionId, workspaceId, content }` | User sends a chat message |
| `agent:run-pack` | renderer → main | `{ sessionId, workspaceId, packId }` | User clicks "Run pack" |
| `agent:cancel` | renderer → main | `{ sessionId }` | Cancel in-flight run |
| `agent:token` | main → renderer | `{ sessionId, token }` | Streaming token from Anthropic SDK |
| `agent:plan-update` | main → renderer | `{ sessionId, steps }` | Plan assembled or step status changed |
| `agent:run-complete` | main → renderer | `{ sessionId, runId }` | Run finished |
| `agent:error` | main → renderer | `{ sessionId, message }` | Agent error |

---

## 14. Backend API Calls

All HTTP calls originate from the **Electron main process** — never directly from the renderer.

```
# Workspaces (workspace-service :8010)
GET    /workspace/              List all workspaces
POST   /workspace/              Create workspace
GET    /workspace/{id}          Get workspace

# Skill packs (skill-registry-service :9028)
GET    /skill-packs             List published packs (displayed in dock selector)

# Artifacts (workspace-manager-service :9027)
GET    /artifact/{wsId}/parent  All artifacts for workspace
GET    /artifact/{wsId}/{id}    Single artifact with narrative, diagram, data
PATCH  /artifact/{wsId}/{id}    Edit artifact data

# Sessions (session-svc :9029)
GET    /sessions?workspace_id={id}    List sessions for workspace
POST   /sessions                      Create new session
GET    /sessions/{id}                 Get session + message history
PATCH  /sessions/{id}                 Append messages (called at message_stop)
```

---

## 15. Components to Build (Recommended Order)

1. **AppShell** — Electron window, screen router, CSS variables, IPC setup
2. **Topbar** — logo, breadcrumb, theme toggle, settings popover
3. **HomeScreen** — greeting, action cards, recent workspaces, activity feed
4. **WorkspaceListScreen** — search/filter, workspace grid, workspace card
5. **NewWorkspaceModal** — form fields, create action
6. **WorkspaceShell** — three-column layout wrapper
7. **Sidebar** — workspace header, nav items, conversation list, new conversation
8. **PackDock** — skill pack selector (from skill-registry-service) + run button
9. **ChatArea** — message thread, plan box, inline question, streaming token append
10. **ChatInput** — textarea, send button, keyboard handling, IPC dispatch
11. **RightPanel** — tab bar, artifact cards, context tab empty state
12. **ArtifactDetailScreen** — two-panel layout, artifact list panel
13. **RepresentationTabs** — tab controller for Narrative / Diagram / Data / Files
14. **NarrativeView** — styled prose card with sections and footer meta
15. **DiagramView** — Mermaid code block + caption
16. **DataView** — syntax-highlighted JSON block
17. **FilesView** — file cards with Electron download trigger

---

## 16. Out of Scope (This Iteration)

- **Skill registry / onboarding UI** — Card shown on Home, link is no-op
- **Artifact kind catalog UI** — Card shown on Home, link is no-op
- **Runs tab** — Nav item present, click is no-op
- **Projects tab** — Nav item with "soon" badge, non-functional
- **Context tab file upload** — Drop zone shown, not wired
- **Pack selector dropdown** — Shows selected pack, click is no-op
- **Artifact file downloads** — Download button shown, `dialog.showSaveDialog` not wired
- **Settings beyond theme** — Popover has one row only
- **Multi-workspace concurrent runs** — One run at a time per workspace
- **LLM agnosticism at orchestration layer** — Claude is an explicit dependency (ADR-012); per-skill execution LLM config via ConfigForge is in scope, swapping the orchestration LLM is not

---

## 17. Key Implementation Rules

1. **Never display `sk.*`, `cam.*`, or `cap.*` identifiers in the UI.** All labels use human-readable domain language.
2. **Skill pack names display the `title` field**, not the internal `key`.
3. **Agent input collection is conversational** — agent asks in chat. No separate form modals for run inputs.
4. **All backend HTTP calls from the Electron main process** — renderer uses IPC only.
5. **The Astra Agent only resolves `sk.*` identifiers** — never reads from capability-service.
6. **Conversation history loads from `session-svc` on workspace open** — not from in-memory state only.
7. **Theme toggle is global and immediate** — `.light` on `<body>` updates all screens via CSS variables.
