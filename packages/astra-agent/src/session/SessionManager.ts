/**
 * SessionManager — loads and saves Anthropic message history to session-svc.
 *
 * Messages (the user-visible conversation) and the reasoning_trace
 * (full Claude tool-use chain) are stored separately.
 * The reasoning_trace keeps the full sk.* planning chain visible for debugging
 * without polluting the clean user-visible conversation replay.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SessionClient } from '../http/clients/SessionClient.js';
import type { SessionMessage } from '../types/agent.types.js';

export class SessionManager {
  private readonly sessionClient: SessionClient;

  constructor(sessionClient: SessionClient) {
    this.sessionClient = sessionClient;
  }

  /**
   * Loads existing conversation messages for a session.
   * Returns an empty array if the session has no messages yet.
   */
  async loadMessages(sessionId: string, signal?: AbortSignal): Promise<SessionMessage[]> {
    try {
      const session = await this.sessionClient.getSession(sessionId, signal);
      return (session.messages as SessionMessage[]) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Saves the updated message list and optional reasoning trace back to session-svc.
   * Called after each complete agent turn (after message_stop).
   */
  async saveMessages(
    sessionId: string,
    messages: SessionMessage[],
    reasoningTrace?: Anthropic.MessageParam[],
    signal?: AbortSignal
  ): Promise<void> {
    await this.sessionClient.updateSession(
      sessionId,
      {
        messages: messages as unknown[],
        ...(reasoningTrace !== undefined ? { reasoning_trace: reasoningTrace as unknown[] } : {}),
      },
      signal
    );
  }

  /**
   * Creates a new session for a workspace.
   * Returns the new session ID.
   */
  async createSession(
    workspaceId: string,
    title?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const session = await this.sessionClient.createSession(
      {
        workspace_id: workspaceId,
        ...(title !== undefined ? { title } : {}),
      },
      signal
    );
    return session.session_id;
  }

  /**
   * Returns all sessions for a workspace, sorted by most recently updated.
   */
  async listSessions(workspaceId: string, signal?: AbortSignal) {
    return this.sessionClient.listSessionsForWorkspace(workspaceId, signal);
  }
}
