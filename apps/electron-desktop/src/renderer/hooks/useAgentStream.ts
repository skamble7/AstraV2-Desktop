/**
 * useAgentStream — the single location that connects IPC agent events to the Zustand store.
 *
 * Mount this hook once in App.tsx. It sets up all agent:* subscriptions on mount
 * and cleans them up on unmount. All other components read from the store —
 * none of them subscribe to IPC directly.
 *
 * All event handlers read conversationId directly from the event payload.
 * This eliminates stale-closure risk — events from any conversation are routed
 * correctly regardless of which conversation is currently visible in the UI.
 */

import { useEffect } from 'react';
import { useAppStore } from '../store/index.js';

export function useAgentStream(): void {
  const appendToken = useAppStore((state) => state.appendToken);
  const finalizeAssistantMessage = useAppStore((state) => state.finalizeAssistantMessage);
  const setConversationStreaming = useAppStore((state) => state.setConversationStreaming);
  const addPlanStep = useAppStore((state) => state.addPlanStep);
  const updatePlanStepStatus = useAppStore((state) => state.updatePlanStepStatus);
  const setAskUserRequest = useAppStore((state) => state.setAskUserRequest);
  const setPlanApprovalRequest = useAppStore((state) => state.setPlanApprovalRequest);
  const clearPlan = useAppStore((state) => state.clearPlan);

  useEffect(() => {
    const api = window.electronAPI;

    const unsubscribeToken = api.onToken((payload) => {
      appendToken(payload.conversation_id, payload.delta);
    });

    const unsubscribePlanUpdate = api.onPlanUpdate((payload) => {
      if (payload.type === 'step_added' && payload.step) {
        addPlanStep(payload.conversation_id, payload.step);
      } else if (payload.type === 'step_started' && payload.step_id) {
        updatePlanStepStatus(payload.conversation_id, payload.step_id, 'running');
      } else if (payload.type === 'step_completed' && payload.step_id) {
        updatePlanStepStatus(payload.conversation_id, payload.step_id, 'completed');
      } else if (payload.type === 'step_failed' && payload.step_id) {
        updatePlanStepStatus(payload.conversation_id, payload.step_id, 'failed');
      }
    });

    const unsubscribeAskUser = api.onAskUser((payload) => {
      setAskUserRequest(payload.conversation_id, {
        token: payload.token,
        question: payload.question,
        input_type: payload.input_type,
        options: payload.options,
      });
    });

    const unsubscribePlanApproval = api.onPlanApprovalRequest((payload) => {
      setPlanApprovalRequest(payload.conversation_id, { token: payload.token, steps: payload.steps });
    });

    const unsubscribeRunComplete = api.onRunComplete((payload) => {
      finalizeAssistantMessage(payload.conversation_id);
      setConversationStreaming(payload.conversation_id, false);
      clearPlan(payload.conversation_id);
      // Refresh artifact list now that the run has persisted artifacts
      const workspaceId = useAppStore.getState().currentWorkspaceId;
      if (workspaceId) {
        void useAppStore.getState().fetchArtifacts(workspaceId);
      }
    });

    const unsubscribeError = api.onError((payload) => {
      appendToken(payload.conversation_id, `\n\n**Error:** ${payload.message}`);
      finalizeAssistantMessage(payload.conversation_id);
      setConversationStreaming(payload.conversation_id, false);
      // Refresh artifacts even on error — some steps may have succeeded
      const workspaceId = useAppStore.getState().currentWorkspaceId;
      if (workspaceId) {
        void useAppStore.getState().fetchArtifacts(workspaceId);
      }
    });

    return () => {
      unsubscribeToken();
      unsubscribePlanUpdate();
      unsubscribeAskUser();
      unsubscribePlanApproval();
      unsubscribeRunComplete();
      unsubscribeError();
    };
  // All these functions are stable references from Zustand — no re-subscription needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
