/**
 * IpcChannels — single source of truth for all IPC channel names and payload types.
 *
 * Imported by:
 *   - src/main/ipc/IpcRouter.ts (ipcMain.handle registrations)
 *   - src/preload/index.ts (contextBridge surface)
 *   - src/renderer/ipc/IpcChannels.ts (re-exported for renderer use)
 *   - src/main/agent/StreamBridge.ts (webContents.send calls)
 *
 * Every channel name appears exactly once. Payload types are co-located
 * so TypeScript can infer end-to-end type safety.
 */

// ─── Channel Name Constants ───────────────────────────────────────────────────

export const IPC_CHANNELS = {
  // renderer → main (invoke)
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_RUN_PACK: 'agent:run-pack',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_PROVIDE_INPUT: 'agent:provide-input',

  // main → renderer (send)
  AGENT_TOKEN: 'agent:token',
  AGENT_PLAN_UPDATE: 'agent:plan-update',
  AGENT_ASK_USER: 'agent:ask-user',
  AGENT_RUN_COMPLETE: 'agent:run-complete',
  AGENT_ERROR: 'agent:error',

  // Workspace operations (renderer → main, invoke)
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_GET: 'workspace:get',

  // Artifact operations (renderer → main, invoke)
  ARTIFACT_LIST: 'artifact:list',
  ARTIFACT_GET: 'artifact:get',

  // Conversation operations (renderer → main, invoke)
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_RENAME: 'conversation:rename',
  CONVERSATION_DELETE: 'conversation:delete',
  CONVERSATION_LOAD_MORE: 'conversation:load-more',

  // Conversation push events (main → renderer)
  CONVERSATION_RENAMED: 'conversation:renamed',

  // Skill pack operations (renderer → main, invoke)
  SKILL_PACK_LIST: 'skill-pack:list',
} as const;

// ─── Payload Types ────────────────────────────────────────────────────────────

// renderer → main payloads
export interface AgentSendMessagePayload {
  workspace_id: string;
  message: string;
  session_id: string;
}

export interface AgentRunPackPayload {
  workspace_id: string;
  pack_key: string;
  pack_version: string;
  inputs: Record<string, unknown>;
  session_id: string;
}

export interface AgentCancelPayload {
  workspace_id: string;
}

export interface AgentProvideInputPayload {
  token: string;
  value: unknown;
}

export interface WorkspaceCreatePayload {
  name: string;
  domain_type: string;
  description?: string;
}

// main → renderer payloads
export interface AgentTokenPayload {
  delta: string;
}

export interface AgentPlanUpdatePayload {
  type: 'step_added' | 'step_started' | 'step_completed' | 'step_failed';
  step_id?: string;
  step_index?: number;
  step?: import('astra-agent').PlanStep;
  error?: string;
}

export interface AgentAskUserPayload {
  token: string;
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}

export interface AgentRunCompletePayload {
  run_id: string | null;
  cancelled?: boolean;
}

export interface AgentErrorPayload {
  message: string;
  fatal: boolean;
}

// Unsubscribe function type
export type Unsubscribe = () => void;
