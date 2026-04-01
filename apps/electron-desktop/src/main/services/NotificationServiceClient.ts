/**
 * NotificationServiceClient — WebSocket client for notification-service (:8016).
 *
 * Listens for skill.updated and skill.created events to invalidate the
 * SkillManifestCache in all active AgentControllers.
 *
 * Uses exponential backoff reconnection with a maximum backoff cap.
 */

import type { AgentRegistry } from '../agent/AgentRegistry.js';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;
const BACKOFF_MULTIPLIER = 2;

export class NotificationServiceClient {
  private ws: WebSocket | null = null;
  private reconnectBackoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private readonly wsUrl: string;
  private readonly agentRegistry: AgentRegistry;

  constructor(wsUrl: string, agentRegistry: AgentRegistry) {
    this.wsUrl = wsUrl;
    this.agentRegistry = agentRegistry;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.reconnectBackoffMs = INITIAL_BACKOFF_MS;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Error is followed by close — reconnect handled in onclose
      };
    } catch {
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    }
  }

  private handleMessage(data: unknown): void {
    try {
      const message = JSON.parse(String(data)) as { routing_key?: string };
      const routingKey = message.routing_key ?? '';

      if (routingKey.includes('skill.updated') || routingKey.includes('skill.created')) {
        this.agentRegistry.invalidateAllSkillCaches();
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectBackoffMs);

    this.reconnectBackoffMs = Math.min(
      this.reconnectBackoffMs * BACKOFF_MULTIPLIER,
      MAX_BACKOFF_MS
    );
  }
}
