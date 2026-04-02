# Astra V2 Desktop

Electron desktop application for the Astra skill-based AI platform. Provides a conversational interface for running AI skills against workspaces, streaming results token-by-token, and exploring generated artifacts.

---

## Repository Structure

```
astraV2-desktop/
├── apps/
│   └── electron-desktop/        # Main Electron + React application
│       ├── src/
│       │   ├── main/            # Electron main process
│       │   ├── preload/         # Context-bridge API surface
│       │   ├── renderer/        # React frontend
│       │   └── shared/          # Types shared across processes
│       └── package.json
├── packages/
│   └── astra-agent/             # Agent engine (Claude + tool execution)
│       └── src/
├── Docs/                        # Architecture documentation
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Managed as a **pnpm monorepo**. The `astra-agent` package is referenced locally by the desktop app via `workspace:*`.

---

## Application Layout

The UI is divided into a persistent chrome and a screen area that swaps based on navigation state.

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar (49px)                                              │
│  [← → ⌂]  [AstraLogo]  [Breadcrumb]        [ThemeToggle]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     <Screen Area>                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### TopBar (`components/layout/TopBar.tsx`)

| Zone | Content |
|---|---|
| Left | macOS traffic-light spacer → Back / Forward / Home nav buttons → Astra logo |
| Center | Breadcrumb (e.g., `Home › Workspaces › My Workspace`) |
| Right | Light/dark theme toggle (persisted to `localStorage`) |

### AppShell (`components/layout/AppShell.tsx`)

Root container wrapping an `ErrorBoundary` around whichever screen is currently active. Applies global CSS variable theme tokens.

---

## Screens

Navigation is history-based and managed entirely in client-side state (no URL routing).

### HomeScreen (`screens/HomeScreen.tsx`)

The landing screen after launch.

- Time-based greeting header with workspace count
- 4-tile action grid: Workspaces, Skill Packs, Artifact Kinds, Docs & Guides
- Recent workspaces list (last 5, with avatar, domain type, relative time)
- Activity feed (placeholder)

### WorkspaceListScreen (`screens/WorkspaceListScreen.tsx`)

Lists all workspaces with search and creation.

- Client-side search by name or domain type
- 3-column card grid — each card shows initials avatar, artifact / run / session counts, status, last updated
- "New Workspace" modal: name (required), domain type (`general` / `architecture` / `legacy` / `data` / `security`), optional description

### WorkspaceShellScreen (`screens/WorkspaceShellScreen.tsx`)

The main working surface for a selected workspace. Three-column layout:

```
┌──────────────┬──────────────────────────┬────────────┐
│ Sidebar      │  ChatPanel               │ Artifacts  │
│ (220px)      │  (flex)                  │ (resizable │
│              │                          │ 200–480px) │
└──────────────┴──────────────────────────┴────────────┘
```

**WorkspaceSidebar** (`components/layout/WorkspaceSidebar.tsx`)
- Workspace header (name + domain type)
- Navigation: Artifacts (`◎`) and Runs (`↺`) links
- Conversation list with "New conversation" button
- Auto-fetches sessions on mount; auto-creates one if none exist

**ChatPanel** (`components/shell/ChatPanel.tsx`)
- SkillPackDock at top — select a skill pack and trigger pack-driven runs
- Scrollable message thread with auto-scroll on new tokens
- Streaming assistant messages rendered token-by-token
- PlanProgressBar — shows plan steps (pending → running → completed) during agent execution
- InlineUserInputPrompt — renders `ask_user` tool requests inline in the chat thread (supports text, URL, file, select input types)
- ChatInput — always-visible text input; shows Cancel during active agent runs

**RightArtifactPanel** (`components/shell/RightArtifactPanel.tsx`)
- Two tabs: **Artifacts** and **Context**
- Artifacts tab: list of artifact cards, each showing a file-type icon, artifact name, and type label (e.g., `Artifact · JSON`)
- Panel width is user-resizable (drag handle) and persisted to `localStorage` under key `astra:rightPanelWidth`

### ArtifactDetailScreen (`screens/ArtifactDetailScreen.tsx`)

Two-panel artifact explorer navigated to from the right panel or sidebar.

```
┌──────────────────┬─────────────────────────────────────────┐
│ Artifact List    │  Detail Pane                            │
│ (280px)          │  [icon] Artifact Name         v3        │
│                  │  [Narrative] [Diagram] [Data] [Files]   │
│ • User Story     │                                         │
│ • Risk Matrix    │  <tab content>                          │
└──────────────────┴─────────────────────────────────────────┘
```

**Left panel** — scrollable list of `ArtifactListItem` components showing file-type icon, display name (derived from `cam.*` kind), representation dot indicators, and category label.

**Right panel** — `ArtifactDetailPane` with four tabs:
- **Narrative** — markdown rendered via `react-markdown`
- **Diagram** — Mermaid diagram (lazy-loaded, theme-aware)
- **Data** — syntax-highlighted JSON view
- **Files** — placeholder for generated file attachments

Artifact kind helpers:
- `kindToDisplayName("cam.agile.user_story")` → `"User Story"`
- `kindToCategory("cam.agile.user_story")` → `"agile"`
- `getArtifactFileInfo(artifact)` → `{ iconType: 'code' | 'document' | 'diagram', typeLabel: 'Artifact · JSON' | … }`

---

## State Management

Global state is a single **Zustand** store named `AstraStore`, composed of 7 slices using the slice pattern. Redux DevTools are connected via the `devtools` middleware.

### NavigationSlice (`store/slices/navigationSlice.ts`)

| State | Type | Description |
|---|---|---|
| `currentScreen` | `'home' \| 'workspace-list' \| 'workspace' \| 'artifact-detail'` | Active screen |
| `currentWorkspaceId` | `string \| null` | Workspace in context |
| `historyStack` | `HistoryEntry[]` | Navigation history |
| `historyIndex` | `number` | Current position in stack |

Actions: `navigateTo(screen, workspaceId?)`, `navigateHome()`, `goBack()`, `goForward()`

### ThemeSlice (`store/slices/themeSlice.ts`)

| State | Type |
|---|---|
| `isLightTheme` | `boolean` |

Actions: `toggleTheme()` — applies `'light'` class to `document.body` and persists to `localStorage`.

### WorkspaceSlice (`store/slices/workspaceSlice.ts`)

| State | Type |
|---|---|
| `workspaces` | `WorkspaceData[]` |
| `activeWorkspace` | `WorkspaceData \| null` |
| `workspacesLoading` | `boolean` |
| `workspacesError` | `string \| null` |

Actions: `fetchWorkspaces()`, `fetchWorkspace(id)`, `createWorkspace(name, domainType, description?)`

### ConversationSlice (`store/slices/conversationSlice.ts`)

| State | Type |
|---|---|
| `sessionsByWorkspace` | `Record<string, SessionData[]>` |
| `activeSessionId` | `string \| null` |
| `messagesBySession` | `Record<string, ChatMessage[]>` |

`ChatMessage` shape: `{ id, role: 'user' | 'assistant', content, isStreaming, timestamp }`

Actions: `fetchSessions(workspaceId)`, `setActiveSession(id)`, `createSession(workspaceId)`, `appendUserMessage(sessionId, content)`, `startAssistantMessage(sessionId)`, `appendToken(sessionId, delta)`, `finalizeAssistantMessage(sessionId)`

### AgentSlice (`store/slices/agentSlice.ts`)

| State | Type |
|---|---|
| `isAgentStreaming` | `boolean` |
| `currentPlanSteps` | `PlanStep[]` |
| `askUserRequest` | `AskUserRequest \| null` |
| `activeStreamingSessionId` | `string \| null` |

`AskUserRequest` shape: `{ token, question, input_type, options? }`

Actions: `setAgentStreaming(streaming, sessionId?)`, `addPlanStep(step)`, `updatePlanStepStatus(stepId, status)`, `clearPlan()`, `setAskUserRequest(request | null)`, `submitUserInput(token, value)`

### ArtifactSlice (`store/slices/artifactSlice.ts`)

| State | Type |
|---|---|
| `artifactsByWorkspace` | `Record<string, ArtifactData[]>` |
| `selectedArtifactId` | `string \| null` |
| `activeRepresentationTab` | `'narrative' \| 'diagram' \| 'data' \| 'files'` |
| `rightPanelTab` | `'artifacts' \| 'context'` |

Actions: `fetchArtifacts(workspaceId)`, `selectArtifact(id | null)`, `setRepresentationTab(tab)`, `setRightPanelTab(tab)`

### SkillPackSlice (`store/slices/skillPackSlice.ts`)

| State | Type |
|---|---|
| `skillPacks` | `SkillPackData[]` |
| `selectedPackId` | `string \| null` |

Actions: `fetchSkillPacks()`, `selectPack(id | null)`

---

## IPC Architecture

Communication between the renderer and Electron main process uses a typed surface exposed via `contextBridge` as `window.electronAPI`. All payloads are validated with **Zod** in the main process before reaching any handler.

### Channel Map (`src/shared/IpcChannels.ts`)

**Renderer → Main (invoke):**

| Channel | Payload |
|---|---|
| `agent:send-message` | `AgentSendMessagePayload` |
| `agent:run-pack` | `AgentRunPackPayload` |
| `agent:cancel` | `{ workspace_id }` |
| `agent:provide-input` | `{ token, value }` |
| `workspace:list` | — |
| `workspace:create` | `{ name, domain_type, description? }` |
| `workspace:get` | `{ workspace_id }` |
| `artifact:list` | `{ workspace_id }` |
| `artifact:get` | `{ workspace_id, artifact_id }` |
| `session:list` | `{ workspace_id }` |
| `session:create` | `{ workspace_id, title? }` |
| `skill-pack:list` | — |

**Main → Renderer (push events):**

| Channel | Payload |
|---|---|
| `agent:token` | `{ delta: string }` — streamed token |
| `agent:plan-update` | Step added or status changed |
| `agent:ask-user` | `{ token, question, input_type, options? }` |
| `agent:run-complete` | Run finished (success or cancelled) |
| `agent:error` | Error message from agent |

### ElectronAPI (`src/preload/ElectronApi.ts`)

```typescript
// Agent
sendMessage(payload): Promise<void>
runPack(payload): Promise<void>
cancelRun(workspaceId): Promise<void>
provideInput(token, value): Promise<void>

// Agent events — each returns an Unsubscribe function
onToken(callback): Unsubscribe
onPlanUpdate(callback): Unsubscribe
onAskUser(callback): Unsubscribe
onRunComplete(callback): Unsubscribe
onError(callback): Unsubscribe

// Workspaces
listWorkspaces(): Promise<WorkspaceData[]>
createWorkspace(name, domainType, description?): Promise<WorkspaceData>
getWorkspace(workspaceId): Promise<WorkspaceData>

// Artifacts
listArtifacts(workspaceId): Promise<ArtifactData[]>
getArtifact(workspaceId, artifactId): Promise<ArtifactData>

// Sessions
listSessions(workspaceId): Promise<SessionData[]>
createSession(workspaceId, title?): Promise<SessionData>

// Skill Packs
listSkillPacks(): Promise<SkillPackData[]>
```

---

## IPC Handlers (Main Process)

Handlers are registered by `IpcRouter` on app start (`src/main/ipc/`).

### AgentIpcHandler

Routes `agent:*` channels to a per-workspace `AgentController` managed by `AgentRegistry`.

- `agent:send-message` → validates → `controller.startIntentRun()`
- `agent:run-pack` → validates → `controller.startPackRun()`
- `agent:cancel` → `agentRegistry.cancelRun(workspaceId)`
- `agent:provide-input` → `agentRegistry.provideInputToActive(token, value)`

`StreamBridge` forwards all agent events (tokens, plan updates, ask_user, run-complete, error) from the `AgentController` to the renderer window via `webContents.send()`.

### WorkspaceIpcHandler

Proxies to `WorkspaceServiceClient` (HTTP to workspace-manager-service `:9027`).

- `workspace:list` → `GET /workspace`
- `workspace:create` → `POST /workspace`
- `workspace:get` → `GET /workspace/{id}`

### ArtifactIpcHandler

Proxies to artifact-service.

- `artifact:list` → `GET /artifact/{workspace_id}?include_deleted=false&limit=50&offset=0`
- `artifact:get` → `GET /artifact/{workspace_id}/{artifact_id}`

Normalises responses: handles `artifact_id` / `id` / `_id` field variants; unwraps bare array or `{ artifacts: [...] }` envelope.

### SessionIpcHandler

Proxies to session-service `:9029`.

- `session:list` → `GET /sessions?workspace_id={id}`
- `session:create` → `POST /sessions`

### SkillPackIpcHandler

Proxies to skill-registry-service `:9028`.

- `skill-pack:list` → `GET /skill-pack?status=published`

---

## Backend Services

The desktop app connects to a set of local microservices:

| Service | Default Port | Responsibility |
|---|---|---|
| workspace-manager-service | `:9027` | Workspace CRUD |
| artifact-service (via workspace) | — | Artifact storage |
| session-service | `:9029` | Conversation sessions |
| skill-registry-service | `:9028` | Skill pack catalogue |
| config-forge | `:8040` | LLM config / credentials |
| workspace-service | `:8010` | Workspace domain data |
| notification-service | `:8016` (WS) | Skill cache invalidation events |

Service base URLs can be overridden via environment variables. The `plannerConfigRef` defaults to `dev.llm.bedrock.explicit-creds`.

---

## Key Packages

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `electron` | `^31.0.0` | Desktop shell |
| `react` | `^18.3.1` | UI framework |
| `react-dom` | `^18.3.1` | DOM renderer |
| `zustand` | `^4.5.4` | Global state management |
| `immer` | `^10.1.1` | Immutable state updates |
| `zod` | `^3.23.8` | IPC payload validation |
| `react-markdown` | `^9.0.1` | Narrative tab markdown rendering |
| `mermaid` | `^11.0.0` | Diagram tab (lazy-loaded, separate chunk) |
| `tailwindcss` | `^3.4.6` | Utility-first styling |
| `@radix-ui/react-dialog` | `^1.1.1` | Accessible modal dialogs |
| `@radix-ui/react-tabs` | `^1.1.0` | Accessible tab components |
| `@radix-ui/react-tooltip` | `^1.1.2` | Tooltips |
| `@radix-ui/react-scroll-area` | `^1.1.0` | Custom scroll containers |
| `clsx` | `^2.1.1` | Conditional class names |
| `tailwind-merge` | `^2.3.0` | Tailwind class deduplication |
| `class-variance-authority` | `^0.7.0` | Component variant patterns |
| `lucide-react` | `^0.395.0` | Icon library (installed; icons currently inline SVG) |
| `electron-updater` | `^6.1.8` | Auto-update |

### Agent Package (`packages/astra-agent`)

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | `^0.50.3` | Claude API (direct) |
| `@anthropic-ai/bedrock-sdk` | `^0.26.4` | Claude via AWS Bedrock |
| `@modelcontextprotocol/sdk` | `^1.0.4` | MCP tool integration |

### Build & Dev

| Package | Version | Purpose |
|---|---|---|
| `electron-vite` | `^2.3.0` | Vite build for Electron (main + preload + renderer) |
| `vite` | `^5.3.3` | Renderer bundler |
| `@vitejs/plugin-react` | `^4.3.1` | React fast refresh |
| `electron-builder` | `^24.13.3` | App packaging & distribution |
| `typescript` | `^5.4.5` | Type system |
| `vitest` | `^2.0.0` | Unit tests (agent package) |

---

## Build & Distribution

**Build tool:** `electron-vite` — separate Vite pipelines for main process, preload script, and renderer. Mermaid is code-split into its own chunk to keep the main bundle lean.

**Packaging:** `electron-builder`

| Platform | Format |
|---|---|
| macOS | DMG (x64 + arm64 universal) |
| Windows | NSIS installer (x64) |
| Linux | AppImage + deb |

**App ID:** `com.astra.desktop`  
**Product name:** Astra Desktop  
**Category:** Developer Tools

---

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (hot reload for renderer, auto-restart for main)
pnpm dev

# Build for production
pnpm build

# Package into distributable
pnpm package

# Run linter
pnpm lint
```
