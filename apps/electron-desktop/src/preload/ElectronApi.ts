/**
 * ElectronAPI interface — the typed surface exposed to the renderer via contextBridge.
 *
 * The renderer accesses this as window.electronAPI.
 * No raw ipcRenderer methods are exposed — every interaction goes through a named,
 * typed function. The on* methods return Unsubscribe functions to prevent memory leaks.
 */

import type {
  AgentSendMessagePayload,
  AgentRunPackPayload,
  AgentTokenPayload,
  AgentPlanUpdatePayload,
  AgentAskUserPayload,
  AgentRunCompletePayload,
  AgentErrorPayload,
  Unsubscribe,
} from '../shared/IpcChannels.js';

// Domain types for data operations
export interface WorkspaceData {
  id: string;
  name: string;
  domain_type: string;
  description?: string;
  status: string;
  artifact_count: number;
  run_count: number;
  conversation_count: number;
  created_at: string;
  updated_at: string;
}

export interface ArtifactData {
  id: string;
  workspace_id: string;
  kind: string;
  data: unknown;
  diagram?: string;
  narrative?: string;
  version: number;
  skill_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionData {
  session_id: string;
  workspace_id: string;
  title?: string;
  messages: unknown[];
  created_at: string;
  updated_at: string;
}

export interface SkillPackData {
  key: string;
  version: string;
  title: string;
  description: string;
  skill_count: number;
  status: string;
}

export interface ElectronAPI {
  // ─── Agent Operations ──────────────────────────────────────────────────────

  /** Send a user chat message to start an intent-driven run. */
  sendMessage(payload: AgentSendMessagePayload): Promise<void>;

  /** Start a pack-driven run. */
  runPack(payload: AgentRunPackPayload): Promise<void>;

  /** Cancel the active run for a workspace. */
  cancelRun(workspaceId: string): Promise<void>;

  /** Provide user input to resume a suspended ask_user prompt. */
  provideInput(token: string, value: unknown): Promise<void>;

  // ─── Agent Event Subscriptions (main → renderer) ──────────────────────────

  /** Streaming token from Claude — append to current message bubble. */
  onToken(callback: (payload: AgentTokenPayload) => void): Unsubscribe;

  /** Plan step added or status changed. */
  onPlanUpdate(callback: (payload: AgentPlanUpdatePayload) => void): Unsubscribe;

  /** ask_user tool invoked — show inline input prompt in chat. */
  onAskUser(callback: (payload: AgentAskUserPayload) => void): Unsubscribe;

  /** Run completed (successfully or cancelled). */
  onRunComplete(callback: (payload: AgentRunCompletePayload) => void): Unsubscribe;

  /** Agent error — show error in chat. */
  onError(callback: (payload: AgentErrorPayload) => void): Unsubscribe;

  // ─── Workspace Operations ─────────────────────────────────────────────────

  listWorkspaces(): Promise<WorkspaceData[]>;
  createWorkspace(name: string, domainType: string, description?: string): Promise<WorkspaceData>;
  getWorkspace(workspaceId: string): Promise<WorkspaceData>;

  // ─── Artifact Operations ──────────────────────────────────────────────────

  listArtifacts(workspaceId: string): Promise<ArtifactData[]>;
  getArtifact(workspaceId: string, artifactId: string): Promise<ArtifactData>;

  // ─── Session Operations ───────────────────────────────────────────────────

  listSessions(workspaceId: string): Promise<SessionData[]>;
  createSession(workspaceId: string, title?: string): Promise<SessionData>;

  // ─── Skill Pack Operations ────────────────────────────────────────────────

  listSkillPacks(): Promise<SkillPackData[]>;
}
