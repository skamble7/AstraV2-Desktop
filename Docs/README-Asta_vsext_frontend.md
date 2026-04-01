# Astra Frontend Architecture

This document describes the architecture of the Astra VSCode extension frontend — how it is structured, how data flows between the extension host and the React webview, how state is managed, what packages are used, and how to build and run the project locally.

## About Astra

Astra (Agentic System for Traceable Reasoning and Artifacts) is a declarative, composable framework for building intelligent knowledge-generation platforms. It enables systems to dynamically produce structured **artifacts** — such as workflows, data dictionaries, architectural models, domain boundaries, and agile deliverables — by orchestrating AI agents and MCP tools through versioned **capability packs**. Astra's core design principle is extensibility without platform changes: new artifact kinds, capabilities, and execution blueprints can be registered at runtime, and the platform immediately gains the ability to produce them. This VSCode extension is the primary frontend for interacting with Astra — it allows users to manage workspaces, browse and edit artifacts, track learning runs, and drive the intent-based planner through a conversational interface backed by a suite of backend microservices.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Extension Host Architecture](#3-extension-host-architecture)
4. [Webview (React App) Architecture](#4-webview-react-app-architecture)
5. [Data Flow: Extension Host ↔ Webview](#5-data-flow-extension-host--webview)
6. [Webview Routing & Navigation](#6-webview-routing--navigation)
7. [State Management](#7-state-management)
8. [API Calls & Backend Services](#8-api-calls--backend-services)
9. [Real-Time Events (WebSocket)](#9-real-time-events-websocket)
10. [Packages & Dependencies](#10-packages--dependencies)
11. [Styling](#11-styling)
12. [Build Pipeline](#12-build-pipeline)
13. [Local Development Setup](#13-local-development-setup)
14. [Notable Patterns & Advanced Topics](#14-notable-patterns--advanced-topics)

---

## 1. Overview

The Astra frontend is a **VSCode extension** that embeds a **React application** as a webview panel. This architecture is a requirement of the VSCode extension model — extensions cannot render arbitrary UI directly; they must host it inside sandboxed webviews.

### Two-Process Model

```
┌──────────────────────────────────────────────────────────────────┐
│  VSCode Extension Host (Node.js)                                 │
│                                                                  │
│  extension.ts  →  AstraPanel.ts  →  AstraWorkspaceService.ts    │
│                        ↕  postMessage                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Webview (Browser Sandbox)                                 │  │
│  │  React 19 + Zustand + Tailwind + shadcn/ui                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  NotificationStream.ts  ←→  ws://localhost:8016/ws (WebSocket)  │
└──────────────────────────────────────────────────────────────────┘
         ↕ HTTP (Fetch)
┌──────────────────────────────────────────────────────────────────┐
│  Astra Backend Microservices (see §8 for port map)               │
└──────────────────────────────────────────────────────────────────┘
```

- **Extension Host** runs in Node.js. It handles HTTP calls to backend services, manages WebSocket connections, and acts as the bridge between the webview and the backend.
- **Webview** runs in a browser-like sandbox. It cannot make arbitrary network calls; all backend communication is proxied through the extension host via `postMessage`.
- **Entry points**: `src/extension.ts` (host), `webview-ui/astra-ui/src/main.tsx` (webview).

---

## 2. Project Structure

```
astraext/
├── src/                          # Extension host (TypeScript, compiled to out/)
│   ├── extension.ts              # Activation, commands, WebSocket setup
│   ├── getNonce.ts               # CSP nonce generator
│   ├── panels/
│   │   ├── AstraPanel.ts         # Main webview panel + message router
│   │   ├── ArtifactEditorPanel.ts# Standalone artifact editor panel
│   │   └── DiagramPanel.ts       # SVG diagram viewer panel
│   └── services/
│       ├── AstraWorkspaceService.ts  # HTTP client for all backend services
│       ├── NotificationStream.ts     # WebSocket notification listener
│       └── PlannerStream.ts          # Session-scoped planner event stream
│
├── webview-ui/
│   └── astra-ui/                 # React application
│       ├── src/
│       │   ├── main.tsx          # React entry point
│       │   ├── App.tsx           # Root component (view routing)
│       │   ├── index.css         # Tailwind base + global styles
│       │   ├── lib/
│       │   │   ├── vscode.ts     # acquireVsCodeApi() wrapper
│       │   │   ├── host.ts       # callHost<T>() + HostReq type union
│       │   │   └── utils.ts      # cn() (clsx + tailwind-merge)
│       │   ├── stores/
│       │   │   └── useAstraStore.ts  # Zustand store (single source of truth)
│       │   ├── types/
│       │   │   └── workspace.ts  # Shared type definitions
│       │   ├── hooks/
│       │   │   └── use-toast.ts  # Toast notification hook
│       │   └── components/
│       │       ├── ui/           # shadcn/ui base components
│       │       ├── home/         # AstraHome landing screen
│       │       ├── workspace/    # Workspace list and create
│       │       ├── workspace-detail/ # Workspace detail tabs
│       │       ├── runs/         # Learning runs list + step tracker
│       │       ├── planner/      # Intent-driven planner (chat + canvas)
│       │       ├── capabilities/ # MCP and LLM onboarding wizards
│       │       ├── editor/       # Fullscreen artifact editor
│       │       └── diagrams/     # Mermaid diagram renderer
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── tsconfig.json
│       └── package.json
│
├── media/
│   └── astra-ui/                 # Vite build output (copied here post-build)
│       ├── manifest.json         # Vite asset manifest (read by AstraPanel)
│       ├── assets/               # Hashed JS + CSS bundles
│       └── ...
│
├── out/                          # Compiled extension host (tsc output)
├── docs/                         # Documentation
├── package.json                  # Extension manifest + root scripts
└── tsconfig.json                 # Extension host TypeScript config
```

---

## 3. Extension Host Architecture

The extension host is the privileged side — it runs in Node.js with full filesystem and network access.

### `src/extension.ts` — Activation Entry Point

Called by VSCode when the extension activates. Responsibilities:
- Creates the **notification WebSocket** (`NotificationStream`) to `ws://localhost:8016/ws` (configurable via `astra.notificationWsUrl` setting).
- Filters incoming events by routing key patterns and forwards them to the webview:
  - Step events: `*.conductor.step.*`, `*.learning.step.*`
  - Planner events: `*.planner.*`
- Registers commands: `astra.open` (open main panel), `astra.notifications.openOutput` (show notification log).
- Registers an activity bar tree view that auto-opens the Astra panel on first visibility.

### `src/panels/AstraPanel.ts` — Main Webview Manager

The central panel class. Responsibilities:
- Creates and manages the `WebviewPanel` with `retainContextWhenHidden: true` (React state is preserved when the panel is hidden).
- Generates the webview HTML by reading `media/astra-ui/manifest.json` (produced by Vite) to inject the correct hashed JS and CSS bundle URIs, along with a CSP nonce.
- Routes all inbound messages from the webview (`setMessageListener`) to `AstraWorkspaceService` calls and returns responses.
- Handles 50+ message types across all feature domains (workspaces, artifacts, runs, planner, onboarding, etc.).
- Manages a `PlannerStream` instance per active session for session-scoped WebSocket events.
- Exposes `AstraPanel.postToWebview()` as a static method so `extension.ts` can push async events (notifications, step updates) to the webview at any time.

### `src/panels/ArtifactEditorPanel.ts` — Artifact Editor Panel

A separate, standalone webview panel for full-screen artifact editing. It loads the same React bundle as `AstraPanel` but sends a `__ASTRA_BOOTSTRAP__` message immediately after load, which causes `App.tsx` to render `ArtifactEditorPage` instead of the normal home/workspace view. The artifact payload is passed directly in the bootstrap message.

### `src/panels/DiagramPanel.ts` — SVG Diagram Viewer

An inline HTML panel (no external scripts) that renders SVG diagrams with zoom controls (25%–300%). Zoom is keyboard-accessible via Cmd/Ctrl + `+`/`-`/`0`. Opened when the user exports a Mermaid diagram to SVG from the artifact view.

### `src/services/AstraWorkspaceService.ts` — HTTP Bridge

A collection of plain functions using the native Fetch API. All calls are made from the extension host (never directly from the webview). Covers all 9 backend microservices. See [§8](#8-api-calls--backend-services) for the full service map.

Note: artifact-service (port 9020) and workspace-manager-service (port 9027) use separate base URL constants — `ARTIFACT_BASE` for `/registry/*` routes and `WORKSPACE_MANAGER_BASE` for `/artifact/{workspaceId}/*` routes.

Notable utilities:
- `json<T>()` — parse response, fallback to raw text on failure.
- `qs()` — build query strings, skipping `undefined`/`null` values.
- `getEtag()` — extract `ETag` header for artifact caching.
- `normalizeWorkspace()` — normalize `id`/`_id` shape differences.

### `src/services/NotificationStream.ts` — WebSocket Client

A durable WebSocket client with:
- **Exponential backoff reconnect**: 1s base, 15s max delay.
- **Heartbeat / idle timeout**: ping every 15s, disconnect after 20s idle.
- **Pretty-printed logging** to a VSCode output channel (routing key + level + message).
- JSON parsing with raw text fallback.

### `src/services/PlannerStream.ts` — Planner Session Stream

A lightweight WebSocket or polling client scoped to a single planner session. Forwards session events (plan updates, step progress) to the webview via callback.

---

## 4. Webview (React App) Architecture

The React app lives in `webview-ui/astra-ui/` and is built with **Vite**. It runs in a browser-like sandbox — no Node.js APIs, no direct network access.

### `src/lib/vscode.ts` — VSCode API Wrapper

Wraps `acquireVsCodeApi()` (provided by VSCode in the webview context) into a typed interface:
```typescript
vscode.postMessage(message)   // send to extension host
vscode.setState(state)        // persist state across panel hide/show
vscode.getState()             // retrieve persisted state
```
`acquireVsCodeApi()` can only be called once, so this module is a singleton.

### `src/lib/host.ts` — Message Protocol

Defines `callHost<T>(req: HostReq): Promise<T>`, the primary way React components communicate with the extension host.

- Each call generates a unique UUID **token**.
- The message is sent via `vscode.postMessage({ ...req, token })`.
- A one-shot `window.addEventListener('message', ...)` waits for a response with the matching token.
- The Promise resolves or rejects based on the `ok` field in the response.

Also defines the `HostReq` discriminated union — 80+ message variants that map 1:1 to the handlers in `AstraPanel.setMessageListener()`.

### `src/stores/useAstraStore.ts` — Zustand Store

Single global store. See [§7](#7-state-management) for details.

### Component Hierarchy

```
App.tsx
├── (bootstrap mode) ArtifactEditorPage      ← fullscreen editor override
├── (modal) CapabilityOnboardingWizard
├── (modal) LLMCapabilityOnboardingWizard
└── (normal mode)
    ├── AstraHome                             ← dashboard / recent items
    ├── WorkspaceLanding                      ← workspace list + create
    └── WorkspaceDetail (WorkspaceExplorer)
        ├── OverviewRegion                    ← workspace summary
        ├── ArtifactView                      ← artifact detail + diagrams + narratives
        ├── RunsTab                           ← learning runs list + step tracker
        └── PlannerTab                        ← chat + plan canvas + execution view
```

---

## 5. Data Flow: Extension Host ↔ Webview

### Request / Response (Webview-Initiated)

```
Webview (React)                        Extension Host
───────────────                        ──────────────
callHost({ type: 'workspace:list',
           token: 'abc-123' })
    → vscode.postMessage(...)  ──────→  AstraPanel.setMessageListener()
                                            → AstraWorkspaceService.listWorkspaces()
                                            → HTTP GET http://127.0.0.1:8010/workspace/
                               ←──────  webview.postMessage({ token: 'abc-123',
                                                               ok: true,
                                                               data: [...] })
Promise resolves with data
    → Zustand store updated
    → Component re-renders
```

Every request carries a unique token; the response carries the same token back. This turns the fire-and-forget `postMessage` API into a typed async/await interface.

### Push Events (Host-Initiated)

The extension host pushes events to the webview at any time — no request token involved:

```
NotificationStream (WebSocket)
    → extension.ts filters by routing key
    → AstraPanel.postToWebview({ type: 'runs:step', data: stepEvent })
        → window message event fires in webview
            → useAstraStore.applyStepEvent() / handlePlannerEvent()
                → Zustand state updated → UI re-renders
```

### Content Security Policy

The webview HTML is generated with a random **nonce** (from `src/getNonce.ts`). The CSP header only permits scripts and styles that carry this nonce, preventing XSS even if malicious content is injected into artifact data.

---

## 6. Webview Routing & Navigation

The React app does **not** use a URL-based router (there is no URL bar in a VSCode webview). Navigation is purely state-driven.

### View States

| State | What Renders |
|---|---|
| `rootView = 'home'` | `AstraHome` — dashboard |
| `rootView = 'workspaces'` | `WorkspaceLanding` — workspace list |
| `currentWorkspaceId` set | `WorkspaceDetail` with tab sub-navigation |
| Bootstrap message received | `ArtifactEditorPage` (fullscreen override) |
| Onboarding triggered | `CapabilityOnboardingWizard` modal overlay |

### State Persistence (Three Tiers)

| Tier | Mechanism | Survives |
|---|---|---|
| In-memory | Zustand store | Component remounts during same panel session |
| Panel-level | `vscode.setState()` | Panel hidden/shown (`retainContextWhenHidden`) |
| Persistent | `localStorage` | Extension reload, VSCode restart |

- `currentWorkspaceId` → `vscode.setState()`
- `rootView` preference → `localStorage` (`astra:rootView`)
- Artifact list view (grid/list) → `localStorage` (`astra:artifacts:view`)

---

## 7. State Management

The entire client state lives in a single **Zustand** store: `webview-ui/astra-ui/src/stores/useAstraStore.ts`.

### Store Shape (Key Slices)

```typescript
{
  // Navigation
  rootView: 'home' | 'workspaces' | 'workspace-detail'
  currentWorkspaceId?: string

  // Workspace data
  wsDoc?: WorkspaceArtifactsDoc    // Consolidated doc: header + all artifacts
  artifacts: Artifact[]
  etags: Record<string, string>    // artifact ID → ETag for caching
  selectedArtifactId?: string
  kindIndex: Record<string, KindRegistryItem>

  // Search / display
  q: string
  view: 'grid' | 'list'

  // Learning runs
  runs: LearningRun[]
  runsById: Record<string, LearningRun>
  selectedRunId?: string

  // Planner (per workspace)
  plannerByWorkspaceId: Record<string, PlannerSessionState>

  // Capability packs
  packs: CapabilityPack[]

  // 50+ action methods ...
}
```

### Key Patterns

**Per-workspace planner sessions**: `plannerByWorkspaceId` is keyed by workspace ID. Switching workspaces does not destroy or pollute planner state from another workspace.

**Non-regressing status transitions**: `mergeStep()` and `mergeRun()` ensure that a late-arriving event cannot roll a step backward from `done` to `running`. This is important because WebSocket events may arrive out-of-order.

**Global event listener**: `registerPlannerEventListener()` is called once in `App.tsx`. It routes incoming push events to the correct workspace's planner state based on the session ID embedded in the event payload.

**ETag caching**: After fetching an artifact, its `ETag` header value is stored in `etags`. Subsequent fetches use `HEAD` first to check freshness before downloading the full body.

---

## 8. API Calls & Backend Services

All HTTP calls originate from the **extension host** (`AstraWorkspaceService.ts`). The webview never calls backend services directly — it sends a `callHost()` message, and the extension host makes the actual HTTP request and relays the result.

### Backend Service Map

| Service | Base URL | Responsibility |
|---|---|---|
| Workspace | `http://127.0.0.1:8010` | CRUD for workspaces |
| Artifact | `http://localhost:9020` | Kind registry (`/registry/*` routes only) |
| Workspace Manager | `http://localhost:9027` | Workspace artifact storage and CRUD (`/artifact/{workspaceId}/*`) |
| Learning (Conductor) | `http://localhost:9022` | Learning runs (start, list, get, delete) |
| Capability | `http://localhost:9021` | Capability packs, resolved packs, input schemas |
| UI | `http://localhost:9024` | UI component mappings (pack → component) |
| Planner | `http://localhost:9025` | Intent-driven planning sessions |
| Onboarding | `http://localhost:9026` | MCP and LLM capability registration |
| Config-Forge | `http://localhost:8040` | LLM provider configurations |

### Key Endpoints (Representative Sample)

```
# Workspaces
GET    /workspace/                              List all workspaces
POST   /workspace/                              Create workspace
GET    /workspace/{id}                          Get workspace
PUT    /workspace/{id}                          Update workspace

# Workspace Manager Service (localhost:9027) — artifact storage
GET    /artifact/{workspaceId}/parent           Consolidated workspace doc
GET    /artifact/{workspaceId}/{artifactId}     Get artifact (with ETag)
HEAD   /artifact/{workspaceId}/{artifactId}     Check freshness
GET    /artifact/{workspaceId}/{artifactId}/history   Version history

# Artifact Service (localhost:9020) — kind registry
GET    /registry/kinds                          List artifact kinds (paginated)
GET    /registry/kinds/{key}                    Get kind schema

# Learning Runs
POST   /runs/start                              Start a learning run
GET    /runs                                    List runs (paginated)
GET    /runs/{runId}                            Get run details
DELETE /runs/{runId}                            Delete run

# Capability Packs
GET    /capability/packs                        List packs (filter by key/version/status)
GET    /capability/packs/{pack_id}              Get pack
GET    /capability/packs/{pack_id}/resolved     Resolved pack (playbooks expanded)
GET    /capability/packs/{pack_id}/playbooks/{playbook_id}/input-schema  Input schema

# Planner
POST   /sessions                                Create planning session
GET    /sessions/{sessionId}                    Get session state
POST   /sessions/{sessionId}/messages           Send user message
GET    /sessions/{sessionId}/plan               Get current plan
PATCH  /sessions/{sessionId}/plan               Update plan steps
POST   /sessions/{sessionId}/plan/approve       Approve plan (returns input form metadata)
POST   /sessions/{sessionId}/run                Start execution with confirmed inputs
GET    /sessions/{sessionId}/runs/{runId}       Get execution run status

# Onboarding
POST   /onboarding/resolve                      Resolve MCP server
POST   /onboarding/register                     Register capability pack
POST   /onboarding/llm/infer                    LLM-infer capability metadata
POST   /onboarding/llm/register                 Register LLM capability
GET    /onboarding/llm/diagram-recipe-templates Diagram templates

# Config
GET    /llm/list                                List LLM configurations
```

---

## 9. Real-Time Events (WebSocket)

### Notification Stream

File: `src/services/NotificationStream.ts`

Connects to the Astra notification WebSocket (`ws://localhost:8016/ws` by default, configurable via the `astra.notificationWsUrl` VS Code setting). This stream carries workspace-level broadcast events from all backend services.

- **Reconnection**: exponential backoff (1s → 2s → 4s → ... → 15s cap).
- **Heartbeat**: ping sent every 15 seconds; connection is reset after 20 seconds idle.
- **Event filtering**: `extension.ts` pattern-matches the `routing_key` field:
  - `*.conductor.step.*` / `*.learning.step.*` → forwarded as `runs:step` messages to the webview.
  - `*.planner.*` → forwarded as `planner:event` messages to the webview.
- **Logging**: all events are pretty-printed to a dedicated VSCode output channel (`Astra Notifications`).

### Planner Stream

File: `src/services/PlannerStream.ts`

A session-scoped stream for real-time planner events (plan updates, clarification requests, status changes). Created by `AstraPanel` when a planner session is connected, and cleaned up on disconnect.

---

## 10. Packages & Dependencies

### Extension Host (`package.json` root)

| Package | Purpose |
|---|---|
| `vscode` (peer) | VSCode extension API |
| `ws` | WebSocket client for `NotificationStream` / `PlannerStream` |
| `typescript` | Extension host compilation |
| `@types/vscode`, `@types/ws` | Type definitions |

### React App (`webview-ui/astra-ui/package.json`)

| Category | Packages |
|---|---|
| **Framework** | `react@19`, `react-dom@19` |
| **Build** | `vite@7`, `@vitejs/plugin-react` |
| **State** | `zustand@5` |
| **UI Components** | `@radix-ui/*` (dialog, dropdown, label, separator, switch, tabs), `lucide-react` |
| **Component Toolkit** | `shadcn/ui` (via Radix primitives + Tailwind, source copied into `components/ui/`) |
| **Styling** | `tailwindcss@3`, `postcss`, `autoprefixer`, `tailwindcss-animate` |
| **Forms** | `react-hook-form`, `@hookform/resolvers`, `@rjsf/core`, `@rjsf/utils`, `@rjsf/validator-ajv8`, `zod`, `ajv` |
| **Editor** | `@monaco-editor/react` |
| **Diagrams** | `mermaid@11` |
| **Markdown** | `react-markdown` |
| **Drag & Drop** | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| **Drawer** | `vaul` |
| **Utilities** | `clsx`, `tailwind-merge` |

---

## 11. Styling

### Approach

The app uses **Tailwind CSS** for utility-first styling, combined with the **shadcn/ui** component library (which is itself built on Radix UI primitives). Components are styled with Tailwind classes and composed with the `cn()` helper:

```typescript
// lib/utils.ts
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs) { return twMerge(clsx(inputs)) }
```

### Theme

Colors are defined as CSS custom properties (HSL) in `index.css`. This allows the entire theme to be changed via a single set of variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --card: 0 0% 100%;
  --border: 240 5.9% 90%;
  /* ... */
}
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```

- Dark mode is activated via the `dark` CSS class (Tailwind `darkMode: ["class"]` strategy).
- The body defaults to `bg-neutral-950 text-neutral-100` (VS Code dark theme alignment).
- Accent palette: blue (primary actions), purple (capability/planner), green/red (status indicators).

### RJSF Custom Templates

`components/workspace-detail/forms/rjsf/ShadcnTemplates.tsx` provides custom field, widget, and layout templates that replace RJSF's default HTML inputs with shadcn/ui components. This ensures JSON Schema-driven forms (used in the planner input modal and onboarding wizards) look consistent with the rest of the UI.

---

## 12. Build Pipeline

### Step 1: Build the React Webview

```bash
cd webview-ui/astra-ui
npm install
npm run build
```

**What happens:**
1. Vite compiles and bundles the React app into `dist/` with content-hashed filenames (e.g., `assets/index-Bx7k3mNj.js`).
2. Vite writes `dist/manifest.json` — a map of entry filenames to their hashed output paths.
3. `scripts/copy-assets.js` copies everything from `dist/` to `../../media/astra-ui/`.

**Why the manifest matters:** `AstraPanel.ts` reads `media/astra-ui/manifest.json` at runtime to find the correct JS and CSS URIs to inject into the webview HTML. This means the extension always serves the latest build without hardcoding filenames.

### Step 2: Compile the Extension Host

```bash
cd ../..        # back to astraext root
npm install
npm run compile
```

**What happens:**
- `tsc -p ./` compiles `src/**/*.ts` to `out/` using `tsconfig.json`.
- Output: `out/extension.js`, `out/panels/*.js`, `out/services/*.js`.

### Step 3: Launch in VS Code

Press **F5** (or use the "Run Extension" launch configuration in `.vscode/launch.json`). This opens a new **Extension Development Host** window with the Astra extension loaded.

---

## 13. Local Development Setup

### Prerequisites

- Node.js (LTS recommended)
- npm
- VS Code

### Full Setup

```bash
# 1. Install and build the React webview
cd webview-ui/astra-ui
npm install
npm run build

# 2. Install and compile the extension host
cd ../..
npm install
npm run compile
```

### Launch

Open the `astraext` folder in VS Code, then press **F5**. A new Extension Development Host window will open. Use the **Astra** icon in the activity bar or run `Astra: Open` from the Command Palette (`Cmd+Shift+P`) to open the panel.

### Development Workflow

For **extension host changes** (TypeScript in `src/`):

```bash
# Watch mode — recompiles on save
npm run watch
```

After saving, reload the Extension Development Host window (`Cmd+Shift+P → Developer: Reload Window`).

For **webview changes** (React in `webview-ui/astra-ui/src/`):

```bash
cd webview-ui/astra-ui
npm run dev        # Vite dev server (not connected to VSCode webview directly)
```

> **Note:** The Vite dev server runs the React app as a standalone browser page, useful for component-level development. To test within the actual VS Code webview, you must run `npm run build` and then reload the Extension Development Host window.

### Configuring the WebSocket URL

The notification WebSocket URL defaults to `ws://localhost:8016/ws`. To override, add this to VS Code settings (`settings.json`):

```json
{
  "astra.notificationWsUrl": "ws://your-host:port/ws"
}
```

---

## 14. Notable Patterns & Advanced Topics

### Multi-Panel Architecture

The extension manages three distinct panel types:

| Panel | File | Purpose |
|---|---|---|
| `AstraPanel` | `panels/AstraPanel.ts` | Main UI — workspaces, artifacts, runs, planner |
| `ArtifactEditorPanel` | `panels/ArtifactEditorPanel.ts` | Full-screen artifact editor (Monaco) |
| `DiagramPanel` | `panels/DiagramPanel.ts` | Read-only SVG viewer with zoom controls |

Each is an independent `WebviewPanel`. `AstraPanel` is a singleton; the others can have multiple instances.

### `__ASTRA_BOOTSTRAP__` Override Pattern

`ArtifactEditorPanel` loads the same React bundle as `AstraPanel`. Immediately after load, it sends:

```typescript
webview.postMessage({ type: '__ASTRA_BOOTSTRAP__', payload: { page: 'editor', artifact: {...} } })
```

`App.tsx` listens for this message on mount. If received, it bypasses normal view-state routing and renders `ArtifactEditorPage` directly with the provided payload. This avoids needing a URL router or separate build artifact for the editor.

### Vite Manifest-Based HTML Injection

`AstraPanel` does not hardcode bundle filenames. Instead:

```typescript
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'astra-ui', manifest['index.html'].file))
const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'astra-ui', manifest['index.html'].css[0]))
```

This means every `npm run build` automatically updates what the webview loads, with no manual filename changes needed.

### Webview Security: Local Resource Roots

The webview's `localResourceRoots` is restricted to `media/astra-ui/`. The webview cannot load scripts or styles from any other location, and cannot make arbitrary external HTTP requests. All network communication is brokered through the extension host.

### Token-Based Request / Response

`callHost()` turns the untyped `postMessage` protocol into a typed `Promise`-based API:

```typescript
// In React component:
const workspaces = await callHost<Workspace[]>({ type: 'workspace:list' })
```

Under the hood:
1. Generates a UUID token.
2. Sends `{ type: 'workspace:list', token }` to the extension host.
3. Registers a one-shot `message` event listener that resolves the Promise when it receives `{ token, ok: true, data }` — or rejects on `{ ok: false, error }`.

### Per-Workspace Planner Session Isolation

The Zustand store maintains a `plannerByWorkspaceId: Record<string, PlannerSessionState>` map. Each workspace has its own independent planner session — switching workspaces never corrupts planner state from another workspace. Sessions are lazily initialized when the Planner tab is first opened for a workspace.

### Step / Run Status State Machine

`mergeStep()` and `mergeRun()` in the store enforce monotonic status progression:

```
pending → running → done | failed | skipped
```

A step already marked `done` cannot be downgraded to `running` by a late-arriving WebSocket event. This prevents UI flickering from out-of-order delivery.

### ETag-Based Artifact Caching

After fetching an artifact, its `ETag` value (from the response header) is stored in `etags[artifactId]`. On subsequent refreshes, a `HEAD` request is made first. If the ETag matches, the cached data is used and the full body download is skipped.

### Monaco Editor

`ArtifactEditorPage` embeds `@monaco-editor/react` for editing artifact content with full syntax highlighting. The editor language is derived from the artifact's kind schema. Changes are saved back through `callHost({ type: 'artifact:save', ... })`.

### Mermaid Diagram Export

`ArtifactDiagrams` renders diagrams inline using the `mermaid` library. Users can export any diagram to SVG, which triggers:

```typescript
callHost({ type: 'diagram:openSvg', svg: renderedSvgString })
```

The extension host opens this in a `DiagramPanel` (a separate VSCode panel) with interactive zoom controls.

### RJSF + shadcn/ui Templates

The planner's `InputFormModal` and the onboarding wizards use `@rjsf/core` to render forms from JSON Schema definitions (provided by the backend). The default RJSF widgets are plain HTML. `ShadcnTemplates.tsx` overrides all field and widget renderers with shadcn/ui components, ensuring visual consistency.

### Hot Reload Limitations

- **Extension host changes**: `npm run watch` recompiles on save. Reload the Extension Development Host window to apply (`Cmd+Shift+P → Developer: Reload Window`).
- **Webview changes**: Must run `npm run build` in `webview-ui/astra-ui/`, then close and reopen the Astra panel (or reload the development host window).
- There is no true hot module replacement (HMR) inside the VS Code webview sandbox.
