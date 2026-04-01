/**
 * useAgentStream — the single location that connects IPC agent events to the Zustand store.
 *
 * Mount this hook once in App.tsx. It sets up all agent:* subscriptions on mount
 * and cleans them up on unmount. All other components read from the store —
 * none of them subscribe to IPC directly.
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
  const clearPlan = useAppStore((state) => state.clearPlan);
  const activeSessionId = useAppStore((state) => state.activeSessionId);

  useEffect(() => {
    const api = window.electronAPI;

    const unsubscribeToken = api.onToken(({ delta }) => {
      if (activeSessionId) {
        appendToken(activeSessionId, delta);
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

    const unsubscribeRunComplete = api.onRunComplete(() => {
      if (activeSessionId) {
        finalizeAssistantMessage(activeSessionId);
      }
      setAgentStreaming(false);
      clearPlan();
    });

    const unsubscribeError = api.onError(({ message }) => {
      if (activeSessionId) {
        appendToken(activeSessionId, `\n\n**Error:** ${message}`);
        finalizeAssistantMessage(activeSessionId);
      }
      setAgentStreaming(false);
    });

    return () => {
      unsubscribeToken();
      unsubscribePlanUpdate();
      unsubscribeAskUser();
      unsubscribeRunComplete();
      unsubscribeError();
    };
  }, [
    activeSessionId,
    appendToken,
    finalizeAssistantMessage,
    setAgentStreaming,
    addPlanStep,
    updatePlanStepStatus,
    setAskUserRequest,
    clearPlan,
  ]);
}
