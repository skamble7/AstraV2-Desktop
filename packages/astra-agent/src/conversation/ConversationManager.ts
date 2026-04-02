/**
 * ConversationManager — loads, saves, and manages Anthropic message history.
 *
 * Replaces SessionManager with:
 * - Context windowing: only the first message + last (WINDOW_SIZE-1) messages
 *   are passed to the Anthropic SDK. Stored history is never modified.
 * - Auto-naming: after the first assistant turn, generates a 5-word summary
 *   via Haiku and PATCHes the conversation title. Fire-and-forget.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SessionClient } from '../http/clients/SessionClient.js';
import type { AnthropicClient } from '../types/agent.types.js';

const WINDOW_SIZE = 40;

/** Model ID for cheap auto-naming calls. */
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

function applyWindow(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= WINDOW_SIZE) return messages;
  return [messages[0]!, ...messages.slice(-(WINDOW_SIZE - 1))];
}

export class ConversationManager {
  private readonly sessionClient: SessionClient;
  private readonly anthropic: AnthropicClient;
  private readonly conversationServiceBaseUrl: string;
  /**
   * Optional callback invoked after successful auto-naming.
   * In the Electron context, wire this to mainWindow.webContents.send.
   */
  private readonly onRenamed: ((conversationId: string, name: string) => void) | undefined;

  constructor(
    sessionClient: SessionClient,
    anthropic: AnthropicClient,
    conversationServiceBaseUrl: string,
    onRenamed?: (conversationId: string, name: string) => void
  ) {
    this.sessionClient = sessionClient;
    this.anthropic = anthropic;
    this.conversationServiceBaseUrl = conversationServiceBaseUrl.replace(/\/$/, '');
    this.onRenamed = onRenamed;
  }

  /**
   * Loads message history for a conversation, applying the context window.
   * Returns windowed messages ready for the Anthropic SDK.
   * Returns [] on any error so the agent always starts cleanly.
   */
  async loadMessages(
    conversationId: string,
    signal?: AbortSignal
  ): Promise<Anthropic.MessageParam[]> {
    try {
      const baseUrl = this.conversationServiceBaseUrl;
      const response = await fetch(
        `${baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
        { signal: signal ?? null }
      );
      if (!response.ok) return [];
      const raw = (await response.json()) as Anthropic.MessageParam[];
      return applyWindow(raw);
    } catch {
      return [];
    }
  }

  /**
   * Saves the updated message list back to the conversation service.
   * If message_count was 0 before this append, fires auto-naming (fire-and-forget).
   */
  async saveMessages(
    conversationId: string,
    messages: Anthropic.MessageParam[],
    previousMessageCount: number,
    reasoningTrace?: Anthropic.MessageParam[],
    signal?: AbortSignal
  ): Promise<void> {
    await this.sessionClient.updateSession(
      conversationId,
      {
        messages: messages as unknown[],
        ...(reasoningTrace !== undefined ? { reasoning_trace: reasoningTrace as unknown[] } : {}),
      },
      signal
    );

    // Auto-name on first assistant turn
    if (previousMessageCount === 0) {
      const firstUserMessage = messages.find((m) => m.role === 'user');
      const content = firstUserMessage?.content;
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .filter((b): b is Anthropic.TextBlockParam => b.type === 'text')
                .map((b) => b.text)
                .join(' ')
            : null;
      if (text) {
        void this.autoName(conversationId, text);
      }
    }
  }

  /**
   * Creates a new conversation for a workspace.
   * Returns the new conversation ID.
   */
  async createConversation(
    workspaceId: string,
    title?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const conversation = await this.sessionClient.createSession(
      {
        workspace_id: workspaceId,
        ...(title !== undefined ? { title } : {}),
      },
      signal
    );
    return conversation.conversation_id;
  }

  /**
   * Returns all conversations for a workspace, sorted by most recently updated.
   */
  async listConversations(workspaceId: string, signal?: AbortSignal) {
    return this.sessionClient.listSessionsForWorkspace(workspaceId, signal);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget auto-naming after the first assistant turn.
   * Generates a 5-word summary via Haiku, PATCHes the conversation,
   * and notifies the renderer. Swallows all errors.
   */
  private async autoName(conversationId: string, firstUserMessage: string): Promise<void> {
    try {
      const response = await this.anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 12,
        messages: [
          {
            role: 'user',
            content: `Summarise in 5 words or fewer: "${firstUserMessage}"`,
          },
        ],
      });
      const block = response.content[0];
      const name = block?.type === 'text' ? block.text.trim() : null;
      if (name) {
        await fetch(
          `${this.conversationServiceBaseUrl}/conversations/${encodeURIComponent(conversationId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          }
        );
        this.onRenamed?.(conversationId, name);
      }
    } catch {
      // Swallow — conversation keeps its default title in the UI
    }
  }
}
