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

  async updateSession(
    sessionId: string,
    request: UpdateSessionRequest,
    signal?: AbortSignal
  ): Promise<SessionDocument> {
    return this.patch<SessionDocument>(
      `/sessions/${encodeURIComponent(sessionId)}`,
      request,
      signal
    );
  }
}
