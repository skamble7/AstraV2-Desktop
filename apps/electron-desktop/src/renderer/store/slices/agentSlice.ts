import type { StateCreator } from 'zustand';
import type { PlanStep } from 'astra-agent';
import type { ElectronAPI } from '../../ipc/ElectronApi.js';

export interface AskUserRequest {
  token: string;
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}

export interface AgentSlice {
  isAgentStreaming: boolean;
  currentPlanSteps: PlanStep[];
  askUserRequest: AskUserRequest | null;
  activeStreamingSessionId: string | null;

  setAgentStreaming: (streaming: boolean, sessionId?: string) => void;
  addPlanStep: (step: PlanStep) => void;
  updatePlanStepStatus: (stepId: string, status: PlanStep['status']) => void;
  clearPlan: () => void;
  setAskUserRequest: (request: AskUserRequest | null) => void;
  submitUserInput: (token: string, value: unknown) => Promise<void>;
}

export const createAgentSlice: StateCreator<AgentSlice> = (set) => ({
  isAgentStreaming: false,
  currentPlanSteps: [],
  askUserRequest: null,
  activeStreamingSessionId: null,

  setAgentStreaming: (streaming, sessionId) =>
    set({
      isAgentStreaming: streaming,
      activeStreamingSessionId: streaming ? (sessionId ?? null) : null,
    }),

  addPlanStep: (step) =>
    set((state) => ({
      currentPlanSteps: [...state.currentPlanSteps, step],
    })),

  updatePlanStepStatus: (stepId, status) =>
    set((state) => ({
      currentPlanSteps: state.currentPlanSteps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      ),
    })),

  clearPlan: () => set({ currentPlanSteps: [] }),

  setAskUserRequest: (request) => set({ askUserRequest: request }),

  submitUserInput: async (token, value) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    await api.provideInput(token, value);
    set({ askUserRequest: null });
  },
});
