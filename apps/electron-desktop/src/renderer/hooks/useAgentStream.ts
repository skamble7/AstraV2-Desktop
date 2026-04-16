/**
 * useAgentStream — the single location that connects IPC agent events to the Zustand store.
 *
 * Mount this hook once in App.tsx. It sets up all agent:* subscriptions on mount
 * and cleans them up on unmount. All other components read from the store —
 * none of them subscribe to IPC directly.
 *
 * Token and run-complete handlers read activeConversationId from the store at call time
 * (not from the closure) to avoid stale-closure bugs when the session changes
 * mid-stream.
 */

import { useEffect } from 'react';
import { useAppStore } from '../store/index.js';

export function useAgentStream(): void {
  const appendToken = useAppStore((state) => state.appendToken);
  const finalizeAssistantMessage = useAppStore((state) => state.finalizeAssistantMessage);
  const setAgentStreaming = useAppStore((state) => state.setAgentStreaming);
  const addPlanStep = useAppStore((state) => state.addPlanStep);
  const updatePlanStepStatus = useAppStore((state) => state.updatePlanStepStatus);
  const setAskUserRequest = useAppStore((state) => state.setAskUserRequest);
  const setPlanApprovalRequest = useAppStore((state) => state.setPlanApprovalRequest);
  const clearPlan = useAppStore((state) => state.clearPlan);

  useEffect(() => {
    const api = window.electronAPI;

    const unsubscribeToken = api.onToken(({ delta }) => {
      const sessionId = useAppStore.getState().activeConversationId;
      if (sessionId) {
        appendToken(sessionId, delta);
      }
    });

    const unsubscribePlanUpdate = api.onPlanUpdate((payload) => {
      if (payload.type === 'step_added' && payload.step) {
        addPlanStep(payload.step);
      } else if (payload.type === 'step_started' && payload.step_id) {
        updatePlanStepStatus(payload.step_id, 'running');
      } else if (payload.type === 'step_completed' && payload.step_id) {
        updatePlanStepStatus(payload.step_id, 'completed');
      } else if (payload.type === 'step_failed' && payload.step_id) {
        updatePlanStepStatus(payload.step_id, 'failed');
      }
    });

    const unsubscribeAskUser = api.onAskUser((payload) => {
      setAskUserRequest({
        token: payload.token,
        question: payload.question,
        input_type: payload.input_type,
        options: payload.options,
      });
    });

    const unsubscribePlanApproval = api.onPlanApprovalRequest((payload) => {
      setPlanApprovalRequest({ token: payload.token, steps: payload.steps });
    });

    const unsubscribeRunComplete = api.onRunComplete(() => {
      const sessionId = useAppStore.getState().activeConversationId;
      if (sessionId) {
        finalizeAssistantMessage(sessionId);
      }
      setAgentStreaming(false);
      clearPlan();
      // Refresh artifact list now that the run has persisted artifacts
      const workspaceId = useAppStore.getState().currentWorkspaceId;
      if (workspaceId) {
        void useAppStore.getState().fetchArtifacts(workspaceId);
      }
    });

    const unsubscribeError = api.onError(({ message }) => {
      const sessionId = useAppStore.getState().activeConversationId;
      if (sessionId) {
        appendToken(sessionId, `\n\n**Error:** ${message}`);
        finalizeAssistantMessage(sessionId);
      }
      setAgentStreaming(false);
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
