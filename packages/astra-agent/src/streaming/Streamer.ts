/**
 * Streamer — typed Node.js EventEmitter for agent events.
 *
 * All agent components emit events via this single Streamer instance.
 * The Electron main process attaches a StreamBridge that forwards
 * each event over IPC to the renderer via webContents.send().
 */

import { EventEmitter } from 'node:events';
import type { AgentEvent } from '../types/stream.types.js';

type AgentEventListener = (event: AgentEvent) => void;

const AGENT_EVENT = 'agent:event';

export class Streamer extends EventEmitter {
  /**
   * Emits a typed AgentEvent. All components call this — never emit raw strings.
   */
  emit(eventName: typeof AGENT_EVENT, event: AgentEvent): boolean;
  emit(eventName: string, ...args: unknown[]): boolean;
  emit(eventName: string, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args);
  }

  /**
   * Subscribes to all agent events. Returns an unsubscribe function.
   */
  onAgentEvent(listener: AgentEventListener): () => void {
    this.on(AGENT_EVENT, listener);
    return () => this.off(AGENT_EVENT, listener);
  }

  /**
   * Publishes an AgentEvent to all subscribers.
   */
  publish(event: AgentEvent): void {
    this.emit(AGENT_EVENT, event);
  }
}
