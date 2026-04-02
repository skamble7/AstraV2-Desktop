import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';

const ListConversationsSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().optional(),
});

const CreateConversationSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().optional(),
  name: z.string().optional(),
});

const RenameConversationSchema = z.object({
  conversation_id: z.string().min(1),
  name: z.string().min(1),
});

const DeleteConversationSchema = z.object({
  conversation_id: z.string().min(1),
});

const LoadMoreConversationsSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().optional(),
  cursor: z.string().min(1),
});

/**
 * Normalise a single conversation document from the backend.
 * Handles both legacy shape (session_id) and new shape (conversation_id)
 * so the handler works regardless of backend migration state.
 */
function normaliseConversation(doc: Record<string, unknown>): Record<string, unknown> {
  let out = doc;
  // Legacy session service used session_id
  if (!out['conversation_id'] && out['session_id']) {
    out = { ...out, conversation_id: out['session_id'] };
  }
  // Legacy service used title; new service uses name
  if (!out['name'] && out['title']) {
    out = { ...out, name: out['title'] };
  }
  // Ensure message_count is present (older backends may omit it)
  if (out['message_count'] === undefined) {
    out = { ...out, message_count: 0 };
  }
  return out;
}

export function registerConversationIpcHandlers(
  conversationServiceBaseUrl: string,
  defaultUserId: string
): void {
  const baseUrl = conversationServiceBaseUrl.replace(/\/$/, '');

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, async (_event, rawPayload: unknown) => {
    const { workspace_id, user_id } = ListConversationsSchema.parse(rawPayload);
    const params = new URLSearchParams({ workspace_id, user_id: user_id || defaultUserId });
    const url = `${baseUrl}/conversations?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[conversation:list] ${response.status} — url: ${url} — body: ${body}`);
      throw new Error(`conversation:list failed: ${response.status} — ${body}`);
    }
    const data = await response.json() as unknown;
    // Normalise: backend may return array or { conversations, next_cursor } envelope
    if (Array.isArray(data)) {
      return { conversations: (data as Record<string, unknown>[]).map(normaliseConversation), next_cursor: null };
    }
    const envelope = data as { conversations?: Record<string, unknown>[]; next_cursor?: string | null };
    if (envelope.conversations) {
      return { ...envelope, conversations: envelope.conversations.map(normaliseConversation) };
    }
    return data;
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE, async (_event, rawPayload: unknown) => {
    const { workspace_id, user_id, name } = CreateConversationSchema.parse(rawPayload);
    const requestBody: Record<string, unknown> = {
      workspace_id,
      user_id: user_id || defaultUserId,
    };
    if (name) requestBody['name'] = name;
    const response = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[conversation:create] ${response.status} — sent: ${JSON.stringify(requestBody)} — response: ${errBody}`);
      throw new Error(`conversation:create failed: ${response.status} — ${errBody}`);
    }
    const doc = await response.json() as Record<string, unknown>;
    return normaliseConversation(doc);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_RENAME, async (_event, rawPayload: unknown) => {
    const { conversation_id, name } = RenameConversationSchema.parse(rawPayload);
    const response = await fetch(
      `${baseUrl}/conversations/${encodeURIComponent(conversation_id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    );
    if (!response.ok) throw new Error(`conversation:rename failed: ${response.status}`);
    return response.json();
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (_event, rawPayload: unknown) => {
    const { conversation_id } = DeleteConversationSchema.parse(rawPayload);
    const response = await fetch(
      `${baseUrl}/conversations/${encodeURIComponent(conversation_id)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error(`conversation:delete failed: ${response.status}`);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD_MORE, async (_event, rawPayload: unknown) => {
    const { workspace_id, user_id, cursor } = LoadMoreConversationsSchema.parse(rawPayload);
    const params = new URLSearchParams({
      workspace_id,
      user_id: user_id || defaultUserId,
      limit: '20',
      before: cursor,
    });
    const response = await fetch(`${baseUrl}/conversations?${params.toString()}`);
    if (!response.ok) throw new Error(`conversation:load-more failed: ${response.status}`);
    const data = await response.json() as unknown;
    if (Array.isArray(data)) {
      return { conversations: data, next_cursor: null };
    }
    return data;
  });
}
