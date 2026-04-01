import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type {
  SessionDocument,
  CreateSessionRequest,
  UpdateSessionRequest,
} from '../../types/service.types.js';

export class SessionClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  async listSessionsForWorkspace(
    workspaceId: string,
    signal?: AbortSignal
  ): Promise<SessionDocument[]> {
    return this.get<SessionDocument[]>(
      `/sessions?workspace_id=${encodeURIComponent(workspaceId)}`,
      signal
    );
  }

  async createSession(
    request: CreateSessionRequest,
    signal?: AbortSignal
  ): Promise<SessionDocument> {
    return this.post<SessionDocument>('/sessions', request, signal);
  }

  async getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDocument> {
    return this.get<SessionDocument>(`/sessions/${encodeURIComponent(sessionId)}`, signal);
  }

  /**
   * Appends / replaces messages on a session.
   * The session-svc API uses:
   *   PATCH /sessions/{session_id}/messages  — append messages
   *   PUT   /sessions/{session_id}/messages  — replace full message history
   *
   * We use PUT here so the agent always writes the authoritative full history.
   */
  async updateSession(
    sessionId: string,
    request: UpdateSessionRequest,
    signal?: AbortSignal
  ): Promise<SessionDocument> {
    return this.put<SessionDocument>(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
      request,
      signal
    );
  }
}
