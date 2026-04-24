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
  AGENT_APPROVE_PLAN: 'agent:approve-plan',

  // main → renderer (send)
  AGENT_TOKEN: 'agent:token',
  AGENT_PLAN_UPDATE: 'agent:plan-update',
  AGENT_ASK_USER: 'agent:ask-user',
  AGENT_PLAN_APPROVAL_REQUEST: 'agent:plan-approval-request',
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
  CONVERSATION_MESSAGES_LIST: 'conversation:messages-list',

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
  conversation_id: string;
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

// main → renderer payloads (all include conversation_id for per-conversation routing)
export interface AgentTokenPayload {
  conversation_id: string;
  delta: string;
}

export interface AgentPlanUpdatePayload {
  conversation_id: string;
  type: 'step_added' | 'step_started' | 'step_completed' | 'step_failed';
  step_id?: string;
  step_index?: number;
  step?: import('astra-agent').PlanStep;
  error?: string;
}

export interface AgentAskUserPayload {
  conversation_id: string;
  token: string;
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}

export interface AgentPlanApprovalRequestPayload {
  conversation_id: string;
  token: string;
  steps: import('astra-agent').PlanStep[];
}

export interface AgentApprovePlanPayload {
  token: string;
  approved: boolean;
}

export interface AgentRunCompletePayload {
  conversation_id: string;
  run_id: string | null;
  cancelled?: boolean;
}

export interface AgentErrorPayload {
  conversation_id: string;
  message: string;
  fatal: boolean;
}

// Unsubscribe function type
export type Unsubscribe = () => void;
