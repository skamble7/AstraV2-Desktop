import type { StateCreator } from 'zustand';
import type { PlanStep } from 'astra-agent';
import type { ElectronAPI } from '../../ipc/ElectronApi.js';

export interface AskUserRequest {
  token: string;
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}

export interface PlanApprovalRequest {
  token: string;
  steps: PlanStep[];
}

/**
 * Per-conversation agent state. Each active conversation gets its own entry in
 * conversationAgentState keyed by conversationId.
 */
export interface ConversationAgentState {
  isStreaming: boolean;
  planSteps: PlanStep[];
  askUserRequest: AskUserRequest | null;
  planApprovalRequest: PlanApprovalRequest | null;
}

const DEFAULT_CONVERSATION_AGENT_STATE: ConversationAgentState = {
  isStreaming: false,
  planSteps: [],
  askUserRequest: null,
  planApprovalRequest: null,
};

export interface AgentSlice {
  conversationAgentState: Record<string, ConversationAgentState>;

  setConversationStreaming: (conversationId: string, streaming: boolean) => void;
  addPlanStep: (conversationId: string, step: PlanStep) => void;
  updatePlanStepStatus: (conversationId: string, stepId: string, status: PlanStep['status']) => void;
  clearPlan: (conversationId: string) => void;
  setAskUserRequest: (conversationId: string, request: AskUserRequest | null) => void;
  submitUserInput: (token: string, value: unknown) => Promise<void>;
  setPlanApprovalRequest: (conversationId: string, request: PlanApprovalRequest | null) => void;
  submitPlanApproval: (token: string, approved: boolean) => Promise<void>;
  removeConversationAgentState: (conversationId: string) => void;
}

function updateConversation(
  state: Record<string, ConversationAgentState>,
  conversationId: string,
  patch: Partial<ConversationAgentState>
): Record<string, ConversationAgentState> {
  const existing = state[conversationId] ?? DEFAULT_CONVERSATION_AGENT_STATE;
  return { ...state, [conversationId]: { ...existing, ...patch } };
}

export const createAgentSlice: StateCreator<AgentSlice> = (set) => ({
  conversationAgentState: {},

  setConversationStreaming: (conversationId, streaming) =>
    set((state) => ({
      conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
        isStreaming: streaming,
      }),
    })),

  addPlanStep: (conversationId, step) =>
    set((state) => {
      const existing = state.conversationAgentState[conversationId] ?? DEFAULT_CONVERSATION_AGENT_STATE;
      return {
        conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
          planSteps: [...existing.planSteps, step],
        }),
      };
    }),

  updatePlanStepStatus: (conversationId, stepId, status) =>
    set((state) => {
      const existing = state.conversationAgentState[conversationId] ?? DEFAULT_CONVERSATION_AGENT_STATE;
      return {
        conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
          planSteps: existing.planSteps.map((s) => (s.id === stepId ? { ...s, status } : s)),
        }),
      };
    }),

  clearPlan: (conversationId) =>
    set((state) => ({
      conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
        planSteps: [],
      }),
    })),

  setAskUserRequest: (conversationId, request) =>
    set((state) => ({
      conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
        askUserRequest: request,
      }),
    })),

  submitUserInput: async (token, value) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    await api.provideInput(token, value);
  },

  setPlanApprovalRequest: (conversationId, request) =>
    set((state) => ({
      conversationAgentState: updateConversation(state.conversationAgentState, conversationId, {
        planApprovalRequest: request,
      }),
    })),

  submitPlanApproval: async (token, approved) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    await api.approvePlan(token, approved);
  },

  removeConversationAgentState: (conversationId) =>
    set((state) => {
      const { [conversationId]: _removed, ...rest } = state.conversationAgentState;
      return { conversationAgentState: rest };
    }),
});
