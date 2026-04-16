/**
 * StreamBridge — bridges AgentController events to the renderer via Electron IPC.
 *
 * Subscribes to all AgentEvents from an AgentController and forwards them
 * to the renderer using webContents.send(). Manages the subscription lifecycle —
 * unsubscribes when the bridge is torn down.
 *
 * One StreamBridge is created per workspace run and torn down when the run ends.
 */

import type { AgentEvent } from 'astra-agent';
import type { AgentController } from 'astra-agent';
import type { WindowManager } from '../WindowManager.js';
import { IPC_CHANNELS } from '../../shared/IpcChannels.js';

export class StreamBridge {
  private unsubscribe: (() => void) | null = null;
  private readonly windowManager: WindowManager;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;
  }

  /**
   * Attaches to an AgentController and begins forwarding events to the renderer.
   * Replaces any existing subscription.
   */
  attach(controller: AgentController): void {
    this.detach();

    this.unsubscribe = controller.onEvent((event: AgentEvent) => {
      this.forwardEvent(event);
    });
  }

  /**
   * Removes the event subscription. Call when a workspace is closed or run ends.
   */
  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private forwardEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'token':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, { delta: event.delta });
        break;

      case 'plan:step_added':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          type: 'step_added',
          step: event.step,
        });
        break;

      case 'run:step_started':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          type: 'step_started',
          step_id: event.step_id,
          step_index: event.step_index,
        });
        break;

      case 'run:step_completed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          type: 'step_completed',
          step_id: event.step_id,
          step_index: event.step_index,
        });
        break;

      case 'run:step_failed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_UPDATE, {
          type: 'step_failed',
          step_id: event.step_id,
          step_index: event.step_index,
          error: event.error,
        });
        break;

      case 'run:completed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_RUN_COMPLETE, {
          run_id: event.run_id,
        });
        break;

      case 'run:failed':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_ERROR, {
          message: event.error,
          fatal: true,
        });
        break;

      case 'run:cancelled':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_RUN_COMPLETE, {
          run_id: null,
          cancelled: true,
        });
        break;

      case 'plan:awaiting_approval':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_PLAN_APPROVAL_REQUEST, {
          token: event.token,
          steps: event.steps,
        });
        break;

      case 'agent:ask_user':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_ASK_USER, {
          token: event.token,
          question: event.question,
          input_type: event.input_type,
          options: event.options,
        });
        break;

      case 'agent:notification':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, {
          delta: `\n${event.message}\n`,
        });
        break;

      case 'agent:raw_artifact_uploaded':
        this.windowManager.sendToRenderer(IPC_CHANNELS.AGENT_TOKEN, {
          delta: `\n📎 File artifact stored — **${event.filename}** (${event.mime_type})\n`,
        });
        break;
    }
  }
}
