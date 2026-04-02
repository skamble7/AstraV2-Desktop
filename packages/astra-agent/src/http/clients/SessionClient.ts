import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type {
  ConversationDocument,
  CreateConversationRequest,
  UpdateConversationRequest,
} from '../../types/service.types.js';

export class SessionClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  async listSessionsForWorkspace(
    workspaceId: string,
    signal?: AbortSignal
  ): Promise<ConversationDocument[]> {
    return this.get<ConversationDocument[]>(
      `/conversations?workspace_id=${encodeURIComponent(workspaceId)}`,
      signal
    );
  }

  async createSession(
    request: CreateConversationRequest,
    signal?: AbortSignal
  ): Promise<ConversationDocument> {
    // Strip undefined fields — backend rejects unknown keys with 422
    const body: Record<string, unknown> = { workspace_id: request.workspace_id };
    if (request.user_id) body['user_id'] = request.user_id;
    if (request.name) body['name'] = request.name;
    return this.post<ConversationDocument>('/conversations', body, signal);
  }

  /**
   * Returns the raw Anthropic messages for a conversation (agent use only).
   * Hits GET /conversations/{id}/messages which preserves full tool-use chains.
   */
  async getSession(conversationId: string, signal?: AbortSignal): Promise<ConversationDocument> {
    return this.get<ConversationDocument>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      signal
    );
  }

  /**
   * Replaces the full message history on a conversation.
   */
  async updateSession(
    conversationId: string,
    request: UpdateConversationRequest,
    signal?: AbortSignal
  ): Promise<ConversationDocument> {
    return this.put<ConversationDocument>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      request,
      signal
    );
  }
}
