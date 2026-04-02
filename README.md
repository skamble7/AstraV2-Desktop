# Astra V2 Desktop

Electron desktop application for the **Astra skill-based AI platform**. Provides a conversational interface for running AI skills against workspaces, streaming results token-by-token, and exploring generated artifacts.

---

## Table of Contents

1. [About Astra](#1-about-astra)
2. [Repository Structure](#2-repository-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Application Layout & Screens](#4-application-layout--screens)
5. [Component Hierarchy](#5-component-hierarchy)
6. [State Management](#6-state-management)
7. [IPC Architecture](#7-ipc-architecture)
8. [IPC Handlers & Backend API Endpoints](#8-ipc-handlers--backend-api-endpoints)
9. [Conversation Lifecycle](#9-conversation-lifecycle)
10. [Agent Architecture (astra-agent)](#10-agent-architecture-astra-agent)
11. [Backend Services](#11-backend-services)
12. [Key Packages](#12-key-packages)
13. [Build & Distribution](#13-build--distribution)
14. [Development](#14-development)

---

## 1. About Astra

Astra (Agentic System for Traceable Reasoning and Artifacts) is a declarative, composable framework for building intelligent knowledge-generation platforms. It enables systems to dynamically produce structured **artifacts** — such as architectural models, data dictionaries, workflows, domain boundaries, and agile deliverables — by orchestrating AI agents and MCP tools through versioned **skill packs**.

This Electron desktop app is the primary frontend for the **skill-based track** of Astra. The companion VSCode extension (`astraext`) continues to serve the capability-based track; both frontends share the same backend microservices.

| Track | Frontend | Registry | Pack prefix |
|---|---|---|---|
| Skills | This Electron app | skill-registry-service (:9028) | `sk.*` |
| Capabilities | VSCode extension | capability-service (:9021) | `cap.*` |
| Artifacts | Both | artifact-service (:9020) | `cam.*` |

---

## 2. Repository Structure

```
astraV2-desktop/
├── apps/
│   └── electron-desktop/              # Main Electron + React application
│       ├── src/
│       │   ├── main/                  # Electron main process
│       │   │   ├── index.ts           # App entry point — wires all services
│       │   │   ├── agent/             # Agent runtime (registry, stream bridge)
│       │   │   │   ├── AgentRegistry.ts
│       │   │   │   └── StreamBridge.ts
│       │   │   └── ipc/               # IPC routing & handlers
│       │   │       ├── IpcRouter.ts
│       │   │       └── handlers/
│       │   │           ├── AgentIpcHandler.ts
│       │   │           ├── WorkspaceIpcHandler.ts
│       │   │           ├── ArtifactIpcHandler.ts
│       │   │           ├── ConversationIpcHandler.ts
│       │   │           └── SkillPackIpcHandler.ts
│       │   ├── preload/
│       │   │   └── index.ts           # contextBridge — exposes window.electronAPI
│       │   ├── renderer/              # React frontend (Vite)
│       │   │   ├── App.tsx            # Root — mounts AppShell + useAgentStream
│       │   │   ├── screens/           # Top-level screen components
│       │   │   ├── components/        # Reusable UI components
│       │   │   ├── store/             # Zustand store (7 slices)
│       │   │   ├── hooks/             # useAgentStream
│       │   │   ├── ipc/               # ElectronApi.ts type definitions
│       │   │   └── lib/               # Utilities (utils.ts, etc.)
│       │   └── shared/
│       │       └── IpcChannels.ts     # Canonical channel names + payload types
│       ├── electron.vite.config.ts
│       └── package.json
│
├── packages/
│   └── astra-agent/                   # Agent engine (TypeScript)
│       └── src/
│           ├── index.ts               # Public API exports
│           ├── controller/            # AgentController (one per workspace)
│           ├── strategies/            # IntentStrategy, PackStrategy
│           ├── execution/             # ExecutionCore + phases
│           ├── streaming/             # Streamer (event bus → IPC)
│           ├── skills/                # SkillResolver, SkillToToolConverter, cache
│           ├── tools/                 # ToolRegistry
│           ├── mcp/                   # McpSessionPool
│           ├── invokers/              # McpInvoker, LlmInvoker
│           ├── persistence/           # ArtifactPersister, RunRecorder
│           ├── http/clients/          # Backend HTTP clients
│           └── types/                 # agent, stream, plan, skill, service types
│
├── Docs/                              # Architecture documentation
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Managed as a **pnpm monorepo**. `astra-agent` is referenced by the desktop app via `workspace:*`.

---

## 3. Architecture Overview

### Three-Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                                │
│                                                                 │
│  index.ts                                                       │
│   ├── AgentRegistry  (one AgentController per workspace)        │
│   ├── StreamBridge   (AgentController events → IPC push)        │
│   ├── IpcRouter      (registers all ipcMain.handle channels)    │
│   └── NotificationServiceClient  (ws://localhost:8016/ws)       │
│                                                                 │
│                  ↕ contextBridge (window.electronAPI)           │
│                                                                 │
│  Preload Script (sandboxed)                                     │
│   └── index.ts  — typed wrapper over ipcRenderer               │
│                                                                 │
│                  ↕ postMessage                                  │
│                                                                 │
│  Renderer Process (Chromium, sandboxed)                         │
│   └── React 18 + Zustand + Tailwind                             │
└─────────────────────────────────────────────────────────────────┘
         ↕ HTTP (from main process only)
┌─────────────────────────────────────────────────────────────────┐
│  Astra Backend Microservices (local, see §11)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle**: the renderer never makes HTTP calls directly. All backend communication is proxied through the main process via IPC. The preload script provides the only bridge — nothing from Node.js is exposed directly to the renderer.

### Main Process Bootstrap (`src/main/index.ts`)

On `app.whenReady()`, the main process:
1. Creates `BrowserWindow` (via `WindowManager`)
2. Instantiates `AgentRegistry` and `StreamBridge`
3. Creates service clients (`WorkspaceServiceClient`, `NotificationServiceClient`)
4. Calls `IpcRouter.register()` — wires all `ipcMain.handle` channels
5. Starts the `NotificationServiceClient` WebSocket to `ws://localhost:8016/ws`
6. Loads `renderer/index.html` into the window

Service base URLs are resolved from environment variables with sensible defaults:

| Variable | Default |
|---|---|
| `SKILL_REGISTRY_URL` | `http://127.0.0.1:9028` |
| `SESSION_SVC_URL` | `http://127.0.0.1:9029` |
| `WORKSPACE_MANAGER_URL` | `http://127.0.0.1:9027` |
| `CONFIG_FORGE_URL` | `http://127.0.0.1:8040` |
| `NOTIFICATION_WS_URL` | `ws://127.0.0.1:8016/ws` |
| `WORKSPACE_SVC_URL` | `http://127.0.0.1:8010` |
| `PLANNER_CONFIG_REF` | `dev.llm.bedrock.explicit-creds` |

---

## 4. Application Layout & Screens

### Chrome

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar (49px)                                                  │
│  [← → ⌂]  [AstraLogo]  [Breadcrumb]             [ThemeToggle]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                       <Screen Area>                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

`TopBar` (`components/layout/TopBar.tsx`) is persistent. The centre zone shows a breadcrumb (e.g. `Home › Workspaces › My Workspace`). The right zone has a light/dark toggle persisted to `localStorage`.

Navigation is **history-based client-side state** — no URL router. `NavigationSlice` manages a `historyStack` with back/forward/home.

### HomeScreen (`screens/HomeScreen.tsx`)

Landing screen after launch:
- Time-based greeting + workspace count
- 4-tile action grid: Workspaces, Skill Packs, Artifact Kinds, Docs & Guides
- Recent workspaces list (last 5, with avatar, domain type, relative time)
- Activity feed (placeholder)

### WorkspaceListScreen (`screens/WorkspaceListScreen.tsx`)

Lists and creates workspaces:
- Client-side search by name or domain type
- 3-column card grid — each card shows initials avatar, artifact/run/session counts, status, last updated
- "New Workspace" modal: name (required), domain type (`general` / `architecture` / `legacy` / `data` / `security`), optional description

### WorkspaceShellScreen (`screens/WorkspaceShellScreen.tsx`)

Main working surface. Three-column layout:

```
┌──────────────┬──────────────────────────┬──────────────────────┐
│  Sidebar     │  ChatPanel               │  RightArtifactPanel  │
│  (220px)     │  (flex 1)                │  (resizable          │
│              │                          │   200–480px,         │
│              │                          │   default 280px)     │
└──────────────┴──────────────────────────┴──────────────────────┘
```

Panel width is user-resizable via a drag handle and persisted to `localStorage` under `astra:rightPanelWidth`.

On workspace open, `WorkspaceShellScreen` resets `activeConversationId` to `null`, fetches conversations, and selects the first one if any exist. No conversation is auto-created.

### ArtifactDetailScreen (`screens/ArtifactDetailScreen.tsx`)

Two-panel artifact explorer:

```
┌──────────────────┬─────────────────────────────────────────────┐
│  Artifact List   │  Detail Pane                                │
│  (280px)         │  [icon]  Artifact Name              v3      │
│                  │  [Narrative]  [Diagram]  [Data]  [Files]    │
│  • User Story    │                                             │
│  • Risk Matrix   │  <tab content>                              │
└──────────────────┴─────────────────────────────────────────────┘
```

Tabs:
- **Narrative** — Markdown rendered via `react-markdown`
- **Diagram** — Mermaid (lazy-loaded, theme-aware)
- **Data** — Syntax-highlighted JSON
- **Files** — Placeholder for generated file attachments

---

## 5. Component Hierarchy

```
App.tsx
 ├── useAgentStream()  ← global hook, mounts once, subscribes to all agent:* events
 └── AppShell (components/layout/AppShell.tsx)
      ├── ErrorBoundary
      ├── TopBar (components/layout/TopBar.tsx)
      └── <active screen>
           ├── HomeScreen
           ├── WorkspaceListScreen
           ├── WorkspaceShellScreen
           │    ├── WorkspaceSidebar (components/layout/WorkspaceSidebar.tsx)
           │    │    ├── Workspace header (name, domain type, initials avatar)
           │    │    ├── "New chat" button
           │    │    ├── Search button (placeholder)
           │    │    ├── Customize button
           │    │    ├── Nav items: Chats, Orbits, Artifacts
           │    │    └── Recents (conversation list with rename/delete)
           │    ├── ChatPanel (components/shell/ChatPanel.tsx)
           │    │    ├── SkillPackDock
           │    │    ├── Message thread (ChatMessage × N)
           │    │    ├── InlineUserInputPrompt (when ask_user active)
           │    │    ├── Stop generating button (when streaming)
           │    │    └── ChatInput
           │    ├── Drag handle (resize)
           │    └── RightArtifactPanel (components/shell/RightArtifactPanel.tsx)
           │         ├── Artifacts section (ArtifactCard × N)
           │         ├── Progress section (PlanProgressBar)
           │         └── Context section (placeholder)
           └── ArtifactDetailScreen
                ├── Artifact list panel
                └── ArtifactDetailPane
                     ├── NarrativeTab
                     ├── DiagramTab
                     ├── DataTab
                     └── FilesTab
```

### Component Responsibilities

| Component | File | Responsibility |
|---|---|---|
| `AppShell` | `layout/AppShell.tsx` | Root container; applies theme CSS vars; wraps `ErrorBoundary` |
| `TopBar` | `layout/TopBar.tsx` | macOS traffic-light spacer, nav buttons, logo, breadcrumb, theme toggle |
| `WorkspaceSidebar` | `layout/WorkspaceSidebar.tsx` | Conversation list; new/rename/delete conversations; nav links |
| `ChatPanel` | `shell/ChatPanel.tsx` | Message thread, streaming display, auto-scroll, send handler |
| `ChatInput` | `shell/ChatInput.tsx` | Auto-growing textarea; Enter sends; Shift+Enter newline; disabled while streaming |
| `ChatMessage` | `shell/ChatMessage.tsx` | Renders a single user or assistant message |
| `InlineUserInputPrompt` | `shell/InlineUserInputPrompt.tsx` | Renders `ask_user` requests inline (text, URL, file, select) |
| `PlanProgressBar` | `shell/PlanProgressBar.tsx` | Shows plan steps as pending → running → completed indicators |
| `SkillPackDock` | `shell/SkillPackDock.tsx` | Skill pack dropdown + "Run pack" button above chat input |
| `RightArtifactPanel` | `shell/RightArtifactPanel.tsx` | Collapsible sections: Artifacts, Progress, Context |
| `CustomizePanel` | `customize/CustomizePanel.tsx` | Settings/preferences panel (replaces ChatPanel when open) |

---

## 6. State Management

Global state is a single **Zustand** store (`store/index.ts`) composed of 7 slices. Redux DevTools are connected via the `devtools` middleware.

```
AppStore = NavigationSlice & ThemeSlice & WorkspaceSlice &
           ConversationSlice & AgentSlice & ArtifactSlice & SkillPackSlice
```

### NavigationSlice (`store/slices/navigationSlice.ts`)

```typescript
currentScreen:      'home' | 'workspace-list' | 'workspace' | 'artifact-detail'
currentWorkspaceId: string | null
historyStack:       HistoryEntry[]
historyIndex:       number
```

Actions: `navigateTo(screen, workspaceId?)`, `navigateHome()`, `goBack()`, `goForward()`

### ThemeSlice (`store/slices/themeSlice.ts`)

```typescript
isLightTheme: boolean
```

Actions: `toggleTheme()` — applies `'light'` class to `document.body`; persists to `localStorage`.

### WorkspaceSlice (`store/slices/workspaceSlice.ts`)

```typescript
workspaces:        WorkspaceData[]
activeWorkspace:   WorkspaceData | null
workspacesLoading: boolean
workspacesError:   string | null
```

Actions: `fetchWorkspaces()`, `fetchWorkspace(id)`, `createWorkspace(name, domainType, description?)`

### ConversationSlice (`store/slices/conversationSlice.ts`)

```typescript
conversationsByWorkspace: Record<string, ConversationData[]>
activeConversationId:     string | null
messagesByConversation:   Record<string, ChatMessage[]>
nextCursor:               string | null
```

`ChatMessage`: `{ id, role: 'user' | 'assistant', content, isStreaming, timestamp }`

Actions:

| Action | Description |
|---|---|
| `fetchConversations(workspaceId)` | GET all conversations; populates `conversationsByWorkspace[id]` |
| `loadMoreConversations(workspaceId)` | Paginated fetch using `nextCursor` |
| `createConversation(workspaceId)` | POST new conversation; sets `activeConversationId`; initialises `messagesByConversation[id] = []` |
| `setActiveConversation(id \| null)` | Switch active conversation |
| `renameConversation(workspaceId, conversationId, name)` | PATCH name via IPC; updates local state |
| `deleteConversation(workspaceId, conversationId)` | DELETE via IPC; removes from local list; selects next |
| `updateConversationName(conversationId, name)` | Local-only name update (called by `onConversationRenamed` push event) |
| `fetchMessages(conversationId)` | GET messages; sets `messagesByConversation[id]` |
| `appendUserMessage(conversationId, content)` | Adds user message optimistically |
| `startAssistantMessage(conversationId)` | Adds empty streaming assistant message |
| `appendToken(conversationId, delta)` | Appends token to last streaming message |
| `finalizeAssistantMessage(conversationId)` | Marks last message `isStreaming: false` |

**`fetchMessages` guard**: `ChatPanel` skips calling `fetchMessages` if `messagesByConversation[conversationId] !== undefined`. This prevents a race condition where the backend fetch overwrites optimistically-appended messages. `createConversation` initialises the key to `[]`, so newly-created conversations are always skipped; conversations loaded from the sidebar list have an `undefined` key and are always fetched.

### AgentSlice (`store/slices/agentSlice.ts`)

```typescript
isAgentStreaming:         boolean
currentPlanSteps:         PlanStep[]
askUserRequest:           AskUserRequest | null   // { token, question, input_type, options? }
activeStreamingSessionId: string | null
```

Actions: `setAgentStreaming(streaming, sessionId?)`, `addPlanStep(step)`, `updatePlanStepStatus(stepId, status)`, `clearPlan()`, `setAskUserRequest(request | null)`, `submitUserInput(token, value)`

### ArtifactSlice (`store/slices/artifactSlice.ts`)

```typescript
artifactsByWorkspace:    Record<string, ArtifactData[]>
selectedArtifactId:      string | null
activeRepresentationTab: 'narrative' | 'diagram' | 'data' | 'files'
rightPanelTab:           'artifacts' | 'context'
```

Actions: `fetchArtifacts(workspaceId)`, `selectArtifact(id | null)`, `setRepresentationTab(tab)`, `setRightPanelTab(tab)`

### SkillPackSlice (`store/slices/skillPackSlice.ts`)

```typescript
skillPacks:    SkillPackData[]
selectedPackId: string | null
```

Actions: `fetchSkillPacks()`, `selectPack(id | null)`

---

## 7. IPC Architecture

The renderer communicates with the main process exclusively through `window.electronAPI`, a typed surface exposed by the preload script via Electron's `contextBridge`. No raw `ipcRenderer` is accessible in the renderer.

### Channel Map (`src/shared/IpcChannels.ts`)

**Renderer → Main (`ipcRenderer.invoke` — awaitable):**

| Channel | Payload |
|---|---|
| `agent:send-message` | `{ workspace_id, message, session_id }` |
| `agent:run-pack` | `{ workspace_id, pack_key, pack_version, inputs, session_id }` |
| `agent:cancel` | `{ workspace_id }` |
| `agent:provide-input` | `{ token, value }` |
| `workspace:list` | — |
| `workspace:create` | `{ name, domain_type, description? }` |
| `workspace:get` | `{ workspace_id }` |
| `artifact:list` | `{ workspace_id }` |
| `artifact:get` | `{ workspace_id, artifact_id }` |
| `conversation:list` | `{ workspace_id, user_id? }` |
| `conversation:create` | `{ workspace_id, user_id?, name? }` |
| `conversation:rename` | `{ conversation_id, name }` |
| `conversation:delete` | `{ conversation_id }` |
| `conversation:load-more` | `{ workspace_id, user_id?, cursor }` |
| `conversation:messages-list` | `{ conversation_id }` |
| `skill-pack:list` | — |

**Main → Renderer (`webContents.send` — push events):**

| Channel | Payload |
|---|---|
| `agent:token` | `{ delta: string }` |
| `agent:plan-update` | `{ type: 'step_added' \| 'step_started' \| 'step_completed' \| 'step_failed', step?, step_id? }` |
| `agent:ask-user` | `{ token, question, input_type, options? }` |
| `agent:run-complete` | `{}` |
| `agent:error` | `{ message: string }` |
| `conversation:renamed` | `{ conversation_id, name }` |

### Preload API (`src/preload/index.ts` → `window.electronAPI`)

All `on*` methods return an `Unsubscribe` function that calls `ipcRenderer.removeListener` to prevent memory leaks.

```typescript
// Agent
sendMessage(payload):          Promise<void>
runPack(payload):              Promise<void>
cancelRun(workspaceId):        Promise<void>
provideInput(token, value):    Promise<void>
onToken(cb):                   Unsubscribe
onPlanUpdate(cb):              Unsubscribe
onAskUser(cb):                 Unsubscribe
onRunComplete(cb):             Unsubscribe
onError(cb):                   Unsubscribe

// Workspaces
listWorkspaces():                                          Promise<WorkspaceData[]>
createWorkspace(name, domainType, description?):           Promise<WorkspaceData>
getWorkspace(workspaceId):                                 Promise<WorkspaceData>

// Artifacts
listArtifacts(workspaceId):                                Promise<ArtifactData[]>
getArtifact(workspaceId, artifactId):                      Promise<ArtifactData>

// Conversations
listConversations(workspaceId, userId?):                   Promise<{ conversations, next_cursor }>
createConversation(workspaceId, name?):                    Promise<ConversationData>
renameConversation(conversationId, name):                  Promise<unknown>
deleteConversation(conversationId):                        Promise<void>
loadMoreConversations(workspaceId, userId?, cursor):        Promise<{ conversations, next_cursor }>
listMessages(conversationId):                              Promise<{ messages: MessageData[] }>
onConversationRenamed(cb):                                 Unsubscribe

// Skill Packs
listSkillPacks():                                          Promise<SkillPackData[]>
```

### useAgentStream Hook (`hooks/useAgentStream.ts`)

Mounted once in `App.tsx`. Subscribes to all `agent:*` push events on mount and returns unsubscribe functions on unmount. Token and run-complete handlers read `activeConversationId` from the store at call time (not from the closure) to avoid stale-closure bugs when the session changes mid-stream.

---

## 8. IPC Handlers & Backend API Endpoints

All HTTP calls originate from the **main process** only.

### AgentIpcHandler (`src/main/ipc/handlers/AgentIpcHandler.ts`)

Delegates to `AgentRegistry` and `StreamBridge`. All payloads validated with Zod.

| Channel | Action |
|---|---|
| `agent:send-message` | `registry.getOrCreate(workspaceId)` → `streamBridge.attach(controller)` → `controller.startIntentRun(message, sessionId)` (fire-and-forget) |
| `agent:run-pack` | Same pattern → `controller.startPackRun(packKey, packVersion, inputs, sessionId)` |
| `agent:cancel` | `registry.cancelRun(workspaceId)` |
| `agent:provide-input` | `registry.provideInputToActive(token, value)` |

### WorkspaceIpcHandler (`src/main/ipc/handlers/WorkspaceIpcHandler.ts`)

Proxies to `WorkspaceServiceClient` → `http://127.0.0.1:8010`

| Channel | HTTP |
|---|---|
| `workspace:list` | `GET /workspace/` |
| `workspace:create` | `POST /workspace/` |
| `workspace:get` | `GET /workspace/{workspace_id}` |

### ArtifactIpcHandler (`src/main/ipc/handlers/ArtifactIpcHandler.ts`)

Proxies to workspace-manager-service → `http://127.0.0.1:9027`

| Channel | HTTP | Notes |
|---|---|---|
| `artifact:list` | `GET /artifact/{workspace_id}?include_deleted=false&limit=50&offset=0` | Normalises bare array or `{ artifacts: [...] }` envelope; normalises `artifact_id`/`id`/`_id` field variants |
| `artifact:get` | `GET /artifact/{workspace_id}/{artifact_id}` | |

### ConversationIpcHandler (`src/main/ipc/handlers/ConversationIpcHandler.ts`)

Proxies to session-service → `http://127.0.0.1:9029`

Responses are normalised on the way out:
- `session_id` → `conversation_id` (legacy compatibility)
- `title` → `name` (legacy compatibility)
- `message_count` defaults to `0` if absent

| Channel | HTTP | Notes |
|---|---|---|
| `conversation:list` | `GET /conversations?workspace_id={id}&user_id={id}` | Handles array or `{ conversations, next_cursor }` envelope |
| `conversation:create` | `POST /conversations` body: `{ workspace_id, user_id, name? }` | |
| `conversation:rename` | `PATCH /conversations/{conversation_id}` body: `{ name }` | Pushes `conversation:renamed` event on success |
| `conversation:delete` | `DELETE /conversations/{conversation_id}` | |
| `conversation:load-more` | `GET /conversations?workspace_id={id}&user_id={id}&limit=20&before={cursor}` | |
| `conversation:messages-list` | `GET /conversations/{conversation_id}/messages` | Extracts text from Anthropic content blocks; returns normalised `{ messages: [{ message_id, role, content, created_at }] }` |

### SkillPackIpcHandler (`src/main/ipc/handlers/SkillPackIpcHandler.ts`)

Proxies to skill-registry-service → `http://127.0.0.1:9028`

| Channel | HTTP |
|---|---|
| `skill-pack:list` | `GET /skill-pack?status=published` |

---

## 9. Conversation Lifecycle

This section documents the complete design and flow for conversations — from workspace open through message send, streaming, and naming.

### 9.1 Workspace Open

When the user navigates to a workspace (`WorkspaceShellScreen` mounts or `currentWorkspaceId` changes):

```
WorkspaceShellScreen.useEffect([currentWorkspaceId])
  1. setActiveConversation(null)          ← reset immediately to avoid stale cross-workspace leakage
  2. fetchConversations(workspaceId)      ← GET /conversations?workspace_id={id}
  3. if (conversations.length > 0):
       setActiveConversation(conversations[0].conversation_id)
     else:
       leave activeConversationId = null  ← no auto-create; user must act
```

`WorkspaceSidebar` also calls `fetchConversations` on mount (for the sidebar list), so the request may fire twice. React Strict Mode doubles effect calls in development, so up to 4 requests per workspace open is normal.

The sidebar shows a hint "No conversations yet. Click 'New chat' to start." when the list is empty.

### 9.2 Creating a Conversation

**Via "New chat" button (WorkspaceSidebar):**

```
handleNewConversation()
  → createConversation(workspaceId)
      → POST /conversations  { workspace_id, user_id: 'local', name: 'New conversation' }
      → store: conversationsByWorkspace[wsId].unshift(newConv)
      → store: activeConversationId = newConv.conversation_id
      → store: messagesByConversation[newConv.id] = []   ← key initialised
```

**Implicitly via first message send (ChatPanel — see §9.3):**

If `activeConversationId` is null when the user sends a message, `ChatPanel.handleSendMessage` creates the conversation before sending.

### 9.3 Sending a Message

`ChatInput` calls `onSend(trimmedContent)` → `ChatPanel.handleSendMessage`:

```
handleSendMessage(content):
  1. if (!conversationId):
       newConv = await createConversation(workspaceId)  ← auto-create if needed
       activeConvId = newConv.conversation_id
     else:
       activeConvId = conversationId

  2. isFirstMessage = (messages.length === 0)           ← capture before appending

  3. appendUserMessage(activeConvId, content)            ← optimistic: adds to local store
  4. startAssistantMessage(activeConvId)                 ← optimistic: adds empty streaming bubble
  5. setAgentStreaming(true, activeConvId)
  6. clearPlan()

  7. window.electronAPI.sendMessage({                    ← IPC invoke → agent:send-message
       workspace_id, message: content, session_id: activeConvId
     })

  8. if (isFirstMessage):                               ← auto-name from first message
       name = truncate(content, 50chars, word-boundary)
       renameConversation(workspaceId, activeConvId, name).catch(() => {})
       → PATCH /conversations/{id}  { name }
       → local: conversationsByWorkspace[wsId][i].name = name
```

### 9.4 Streaming Response

After `agent:send-message` reaches the main process:

```
AgentIpcHandler
  → AgentRegistry.getOrCreate(workspaceId)   ← one controller per workspace
  → StreamBridge.attach(controller)
  → controller.startIntentRun(message, sessionId)   (fire-and-forget)
        ↓
    astra-agent / IntentStrategy
      → loads conversation history from session-service
      → calls Claude (Anthropic SDK or AWS Bedrock)
      → streams plan steps + tokens + artifacts

    Events emitted by controller → StreamBridge → webContents.send():
      agent:token         → appendToken(sessionId, delta)         → streaming bubble updates
      agent:plan-update   → addPlanStep / updatePlanStepStatus    → PlanProgressBar updates
      agent:ask-user      → setAskUserRequest(...)                → InlineUserInputPrompt renders
      agent:run-complete  → finalizeAssistantMessage(sessionId)   → streaming stops
                            setAgentStreaming(false)
      agent:error         → appendToken (error text) + finalize   → error shown inline
```

### 9.5 User Input During a Run (ask_user)

```
InlineUserInputPrompt renders (input_type: text | url | file | select)
  → user submits value
  → submitUserInput(token, value)
      → window.electronAPI.provideInput(token, value)
          → AGENT_PROVIDE_INPUT IPC
          → registry.provideInputToActive(token, value)
          → controller.provideUserInput(token, value)
          → Promise resolver in userInputResolvers fires → execution resumes
  → setAskUserRequest(null)   ← clears the prompt
```

### 9.6 Cancellation

```
"Stop generating" button (ChatPanel)
  → window.electronAPI.cancelRun(workspaceId)
      → AGENT_CANCEL IPC
      → registry.cancelRun(workspaceId)
      → controller.cancel()   ← AbortController.abort()
          → agent:run-complete pushed
          → setAgentStreaming(false)
          → finalizeAssistantMessage
```

### 9.7 Conversation Rename & Delete

**Rename** (double-click or context menu in WorkspaceSidebar):
- Inline `<input>` on blur/Enter → `renameConversation(workspaceId, conversationId, newName)`
- `PATCH /conversations/{id}` → backend pushes `conversation:renamed` event
- `onConversationRenamed` listener (set up in `conversationSlice` init) → `updateConversationName`

**Delete** (context menu → confirmation dialog → confirm):
- `deleteConversation(workspaceId, conversationId)`
- `DELETE /conversations/{id}` → removes from local list
- If it was the active conversation, auto-selects `remaining[0]` or sets null

### 9.8 fetchMessages Guard

`ChatPanel.useEffect([conversationId])` calls `fetchMessages(conversationId)` when the active conversation changes — but only if `messagesByConversation[conversationId] === undefined`.

```
messagesByConversation[id] is undefined → fetch messages from backend (normal load)
messagesByConversation[id] is []        → skip fetch (conversation just created locally)
messagesByConversation[id] is [...]     → skip fetch (already cached)
```

This prevents a race condition where `fetchMessages` returns `[]` from the backend and overwrites optimistically-appended messages when the user sends on a brand-new conversation.

---

## 10. Agent Architecture (astra-agent)

The `packages/astra-agent` package is a standalone TypeScript library consumed by the Electron main process. It contains the complete agent runtime.

### AgentController (`controller/AgentController.ts`)

One controller per workspace, instantiated by `AgentRegistry`.

```typescript
// Public API
onEvent(listener: (event: AgentEvent) => void): Unsubscribe
startIntentRun(intent: string, sessionId: string):                       Promise<void>
startPackRun(packKey, packVersion, inputs, sessionId):                   Promise<void>
cancel():                                                                void
provideUserInput(token: string, value: unknown):                         void
invalidateSkillCache():                                                  void
```

Constructor dependencies (injected via `AgentServiceConfig`):
- `Streamer` — event bus → StreamBridge → IPC
- `SessionClient` — load/save conversation history (session-service)
- `SkillRegistryClient` — fetch skill manifests (skill-registry-service)
- `ConfigForgeClient` — resolve LLM credentials (config-forge)
- `LlmClientFactory` — create `Anthropic` or `AnthropicBedrockClient`
- `ArtifactPersister` — save generated artifacts (workspace-manager-service)
- `RunRecorder` — track run metadata
- `SkillResolver` + `SkillToToolConverter` + `ToolRegistry` — skill → Claude tool pipeline
- `McpSessionPool` — manage MCP server connections per workspace

### Run Strategies

**IntentStrategy** (`strategies/IntentStrategy.ts`):
- Called for `agent:send-message` runs
- Uses Claude to plan: selects relevant skills, produces a `Plan` with steps
- Each step maps to a skill (identified by `tool_name`)
- Hands the plan to `ExecutionCore`

**PackStrategy** (`strategies/PackStrategy.ts`):
- Called for `agent:run-pack` runs
- Deterministic: reads playbook from the skill pack manifest
- No LLM planning phase; steps are predetermined
- Hands the plan to `ExecutionCore`

### ExecutionCore (`execution/ExecutionCore.ts`)

Executes a `Plan` step-by-step. Each step runs three phases:

```
For each step:
  1. DiscoverPhase  — MCP tool invocation(s); collects raw data
  2. DiagramPhase   — Generates Mermaid diagram from discovered data
  3. NarrativePhase — Claude generates a narrative description
  → ArtifactPersister saves the resulting artifact to workspace-manager-service
  → step status events streamed: step_started → step_completed | step_failed
```

### Agent Events (`types/stream.types.ts`)

```typescript
type AgentEvent =
  | { type: 'token';             delta: string }
  | { type: 'plan:step_added';   step: PlanStep }
  | { type: 'run:step_started';  step_id: string; step_index: number }
  | { type: 'run:step_completed';step_id: string; step_index: number }
  | { type: 'run:step_failed';   step_id: string; step_index: number; error: string }
  | { type: 'run:completed';     run_id: string }
  | { type: 'run:failed';        error: string }
  | { type: 'run:cancelled' }
  | { type: 'agent:ask_user';    token: string; question: string; input_type: string; options?: string[] }
  | { type: 'agent:notification';message: string }
```

### StreamBridge (`src/main/agent/StreamBridge.ts`)

Sits between `AgentController` (in main process) and the renderer. Calls `controller.onEvent()` and translates events to `webContents.send()` calls on the matching IPC push channels.

### LLM Backends

The agent supports two LLM backends, selected at runtime via `plannerConfigRef`:

| Backend | SDK | Config |
|---|---|---|
| Direct Anthropic | `@anthropic-ai/sdk` | API key via config-forge |
| AWS Bedrock | `@anthropic-ai/bedrock-sdk` | Explicit AWS credentials via config-forge |

`LlmClientFactory` resolves credentials from `ConfigForgeClient` and returns the appropriate client. The rest of the agent is backend-agnostic.

### MCP Integration

Skills declare their MCP server requirements in their frontmatter. `McpSessionPool` manages one MCP session per server per workspace. `McpInvoker` calls tools on these sessions during the Discover phase. One tool per skill is enforced (ADR-011).

---

## 11. Backend Services

| Service | Default Port | Responsibility |
|---|---|---|
| workspace-service | `:8010` | Workspace CRUD |
| workspace-manager-service | `:9027` | Artifact storage and retrieval |
| artifact-service | `:9020` | Artifact kind registry (`cam.*`) |
| session-service | `:9029` | Conversations + messages |
| skill-registry-service | `:9028` | Skill pack catalogue (`sk.*`) |
| config-forge | `:8040` | LLM provider config + credentials |
| notification-service | `:8016` (WS) | Broadcast events (skill cache invalidation) |

Service URLs can be overridden via environment variables (see §3).

---

## 12. Key Packages

### Electron App (`apps/electron-desktop/package.json`)

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
| `lucide-react` | `^0.395.0` | Icon library |
| `electron-updater` | `^6.1.8` | Auto-update |
| `electron-vite` | `^2.3.0` | Vite build for Electron |
| `vite` | `^5.3.3` | Renderer bundler |
| `electron-builder` | `^24.13.3` | App packaging |
| `typescript` | `^5.4.5` | Type system |
| `vitest` | `^2.0.0` | Unit tests (agent package) |

### Agent Package (`packages/astra-agent/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | `^0.50.3` | Claude API (direct) |
| `@anthropic-ai/bedrock-sdk` | `^0.26.4` | Claude via AWS Bedrock |
| `@modelcontextprotocol/sdk` | `^1.0.4` | MCP tool integration |

---

## 13. Build & Distribution

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

## 14. Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start dev server — hot reload for renderer, auto-restart for main
pnpm dev

# Build for production
pnpm build

# Package into distributable
pnpm package

# Run linter
pnpm lint
```

### Notes

- The preload script does **not** hot-reload. If you change `src/preload/index.ts`, you must fully restart the Electron process for the new `window.electronAPI` surface to take effect. Vite's HMR only covers the renderer.
- Zustand DevTools are available in development via the Redux DevTools browser extension (the store is named `AstraStore`).
- React Strict Mode is active in development; `useEffect` callbacks run twice on mount. This is normal and explains the 2× `conversation:list` and `conversation:messages-list` log entries seen per workspace open.
