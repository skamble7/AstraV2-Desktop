/**
 * StreamBridge — bridges AgentController events to the renderer via Electron IPC.
 *
 * Supports multiple simultaneous conversation subscriptions. Each subscription is
 * keyed by conversationId so events from different conversations are routed
 * independently. Every forwarded payload includes conversation_id so the renderer
 * can route events to the correct conversation's UI state.
 *
 * Terminal events (run:completed, run:failed, run:cancelled) automatically detach
 * the subscription after forwarding — no manual cleanup needed at the call site.
 */

import type { AgentEvent } from 'astra-agent';
import type { AgentController } from 'astra-agent';
import type { WindowManager } from '../WindowManager.js';
import { IPC_CHANNELS } from '../../shared/IpcChannels.js';

export class StreamBridge {
  private readonly subscriptions = new Map<string, () => void>();
  private readonly windowManager: WindowManager;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;
  }

  /**
   * Attaches to an AgentController for the given conversation and begins
   * forwarding its events to the renderer. Replaces any existing subscription
   * for that conversation (safe to call on re-send).
   */
  attach(conversationId: string, controller: AgentController): void {
    this.detach(conversationId);

    const unsubscribe = controller.onEvent((event: AgentEvent) => {
      this.forwardEvent(conversationId, event);
    });

    this.subscriptions.set(conversationId, unsubscribe);
  }

  /**
   * Removes the event subscription for a specific conversation.
   */
  detach(conversationId: string): void {
    this.subscriptions.get(conversationId)?.();
    this.subscriptions.delete(conversationId);
  }

  /**
   * Removes all subscriptions (e.g. on app shutdown).
   */
  detachAll(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
  }

  private forwardEvent(conversationId: string, event: AgentEvent): void {
    switch (event.type) {
      case 'token':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, {
          conversation_id: conversationId,
          delta: event.delta,
        });
        break;

      case 'plan:step_added':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          conversation_id: conversationId,
          type: 'step_added',
          step: event.step,
        });
        break;

      case 'run:step_started':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          conversation_id: conversationId,
          type: 'step_started',
          step_id: event.step_id,
          step_index: event.step_index,
        });
        break;

      case 'run:step_completed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          conversation_id: conversationId,
          type: 'step_completed',
          step_id: event.step_id,
          step_index: event.step_index,
        });
        break;

      case 'run:step_failed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          conversation_id: conversationId,
          type: 'step_failed',
          step_id: event.step_id,
          step_index: event.step_index,
          error: event.error,
        });
        break;

      case 'run:completed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_RUN_COMPLETE, {
          conversation_id: conversationId,
          run_id: event.run_id,
        });
        this.detach(conversationId);
        break;

      case 'run:failed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_ERROR, {
          conversation_id: conversationId,
          message: event.error,
          fatal: true,
        });
        this.detach(conversationId);
        break;

      case 'run:cancelled':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_RUN_COMPLETE, {
          conversation_id: conversationId,
          run_id: null,
          cancelled: true,
        });
        this.detach(conversationId);
        break;

      case 'plan:awaiting_approval':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_APPROVAL_REQUEST, {
          conversation_id: conversationId,
          token: event.token,
          steps: event.steps,
        });
        break;

      case 'agent:ask_user':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_ASK_USER, {
          conversation_id: conversationId,
          token: event.token,
          question: event.question,
          input_type: event.input_type,
          options: event.options,
        });
        break;

      case 'agent:notification':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, {
          conversation_id: conversationId,
          delta: `\n${event.message}\n`,
        });
        break;

      case 'agent:raw_artifact_uploaded':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, {
          conversation_id: conversationId,
          delta: `\n📎 File artifact stored — **${event.filename}** (${event.mime_type})\n`,
        });
        break;
    }
  }
}
