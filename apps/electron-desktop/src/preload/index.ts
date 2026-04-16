/**
 * Preload script — runs in a sandboxed context with access to both
 * browser APIs and a limited Node.js API via contextBridge.
 *
 * Exposes window.electronAPI with the typed ElectronAPI interface.
 * No raw ipcRenderer is exposed to the renderer.
 * All on* methods return Unsubscribe functions that call removeListener.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/IpcChannels.js';
import type {
  AgentSendMessagePayload,
  AgentRunPackPayload,
  AgentTokenPayload,
  AgentPlanUpdatePayload,
  AgentAskUserPayload,
  AgentPlanApprovalRequestPayload,
  AgentRunCompletePayload,
  AgentErrorPayload,
  Unsubscribe,
} from '../shared/IpcChannels.js';

function createSubscription<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Agent Operations ─────────────────────────────────────────────────────
  sendMessage: (payload: AgentSendMessagePayload): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, payload),

  runPack: (payload: AgentRunPackPayload): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN_PACK, payload),

  cancelRun: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, { workspace_id: workspaceId }),

  provideInput: (token: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_PROVIDE_INPUT, { token, value }),

  approvePlan: (token: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_APPROVE_PLAN, { token, approved }),

  // ─── Event Subscriptions ──────────────────────────────────────────────────
  onToken: (callback: (p: AgentTokenPayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_TOKEN, callback),

  onPlanUpdate: (callback: (p: AgentPlanUpdatePayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_PLAN_UPDATE, callback),

  onAskUser: (callback: (p: AgentAskUserPayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_ASK_USER, callback),

  onPlanApprovalRequest: (callback: (p: AgentPlanApprovalRequestPayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_PLAN_APPROVAL_REQUEST, callback),

  onRunComplete: (callback: (p: AgentRunCompletePayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_RUN_COMPLETE, callback),

  onError: (callback: (p: AgentErrorPayload) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.AGENT_ERROR, callback),

  // ─── Workspace Operations ─────────────────────────────────────────────────
  listWorkspaces: (): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),

  createWorkspace: (name: string, domainType: string, description?: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, { name, domain_type: domainType, description }),

  getWorkspace: (workspaceId: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, { workspace_id: workspaceId }),

  // ─── Artifact Operations ──────────────────────────────────────────────────
  listArtifacts: (workspaceId: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ARTIFACT_LIST, { workspace_id: workspaceId }),

  getArtifact: (workspaceId: string, artifactId: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.ARTIFACT_GET, { workspace_id: workspaceId, artifact_id: artifactId }),

  // ─── Conversation Operations ──────────────────────────────────────────────
  listConversations: (workspaceId: string, userId: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST, { workspace_id: workspaceId, user_id: userId }),

  createConversation: (workspaceId: string, name?: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE, { workspace_id: workspaceId, name }),

  renameConversation: (conversationId: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_RENAME, { conversation_id: conversationId, name }),

  deleteConversation: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, { conversation_id: conversationId }),

  loadMoreConversations: (workspaceId: string, userId: string, cursor: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD_MORE, { workspace_id: workspaceId, user_id: userId, cursor }),

  onConversationRenamed: (callback: (p: { conversation_id: string; name: string }) => void): Unsubscribe =>
    createSubscription(IPC_CHANNELS.CONVERSATION_RENAMED, callback),

  listMessages: (conversationId: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_MESSAGES_LIST, { conversation_id: conversationId }),

  // ─── Skill Pack Operations ────────────────────────────────────────────────
  listSkillPacks: (): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_PACK_LIST),
});
