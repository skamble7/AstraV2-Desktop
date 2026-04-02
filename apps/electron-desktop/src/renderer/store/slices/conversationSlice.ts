import type { StateCreator } from 'zustand';
import type { ElectronAPI, ConversationData, MessageData } from '../../ipc/ElectronApi.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
  timestamp: number;
}

export interface ConversationSlice {
  conversationsByWorkspace: Record<string, ConversationData[]>;
  activeConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
  nextCursor: string | null;

  fetchConversations: (workspaceId: string, userId?: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  setActiveConversation: (conversationId: string | null) => void;
  createConversation: (workspaceId: string) => Promise<ConversationData>;
  loadMoreConversations: (workspaceId: string, userId?: string) => Promise<void>;
  renameConversation: (workspaceId: string, conversationId: string, name: string) => Promise<void>;
  deleteConversation: (workspaceId: string, conversationId: string) => Promise<void>;
  updateConversationName: (conversationId: string, name: string) => void;

  appendUserMessage: (conversationId: string, content: string) => string;
  startAssistantMessage: (conversationId: string) => string;
  appendToken: (conversationId: string, delta: string) => void;
  finalizeAssistantMessage: (conversationId: string) => void;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

function getApi(): ElectronAPI {
  return (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
}

export const createConversationSlice: StateCreator<ConversationSlice> = (set, get) => {
  // Subscribe to conversation:renamed push events on slice creation.
  // This runs once when the store is initialised.
  if (typeof window !== 'undefined') {
    const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
    if (api?.onConversationRenamed) {
      api.onConversationRenamed(({ conversation_id, name }) => {
        get().updateConversationName(conversation_id, name);
      });
    }
  }

  return {
    conversationsByWorkspace: {},
    activeConversationId: null,
    messagesByConversation: {},
    nextCursor: null,

    fetchConversations: async (workspaceId, userId = '') => {
      const api = getApi();
      const { conversations, next_cursor } = await api.listConversations(workspaceId, userId);
      set((state) => ({
        conversationsByWorkspace: {
          ...state.conversationsByWorkspace,
          [workspaceId]: conversations,
        },
        nextCursor: next_cursor,
      }));
    },

    fetchMessages: async (conversationId) => {
      const api = getApi();
      if (typeof api.listMessages !== 'function') {
        console.error('[fetchMessages] api.listMessages is not available — restart the app fully to reload the preload');
        return;
      }
      console.log('[fetchMessages] fetching for conversation:', conversationId);
      const { messages } = await api.listMessages(conversationId);
      console.log('[fetchMessages] received', (messages as MessageData[]).length, 'messages');
      const mapped: ChatMessage[] = (messages as MessageData[]).map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        isStreaming: false,
        timestamp: Date.now(),
      }));
      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: mapped,
        },
      }));
    },

    setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),

    createConversation: async (workspaceId) => {
      const api = getApi();
      const conversation = await api.createConversation(workspaceId, 'New conversation');
      set((state) => ({
        conversationsByWorkspace: {
          ...state.conversationsByWorkspace,
          [workspaceId]: [
            conversation,
            ...(state.conversationsByWorkspace[workspaceId] ?? []),
          ],
        },
        activeConversationId: conversation.conversation_id,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversation.conversation_id]: [],
        },
      }));
      return conversation;
    },

    loadMoreConversations: async (workspaceId, userId = '') => {
      const { nextCursor } = get();
      if (!nextCursor) return;
      const api = getApi();
      const { conversations, next_cursor } = await api.loadMoreConversations(
        workspaceId,
        userId,
        nextCursor
      );
      set((state) => ({
        conversationsByWorkspace: {
          ...state.conversationsByWorkspace,
          [workspaceId]: [
            ...(state.conversationsByWorkspace[workspaceId] ?? []),
            ...conversations,
          ],
        },
        nextCursor: next_cursor,
      }));
    },

    renameConversation: async (workspaceId, conversationId, name) => {
      const api = getApi();
      await api.renameConversation(conversationId, name);
      set((state) => ({
        conversationsByWorkspace: {
          ...state.conversationsByWorkspace,
          [workspaceId]: (state.conversationsByWorkspace[workspaceId] ?? []).map((c) =>
            c.conversation_id === conversationId ? { ...c, name } : c
          ),
        },
      }));
    },

    deleteConversation: async (workspaceId, conversationId) => {
      const api = getApi();
      await api.deleteConversation(conversationId);
      set((state) => {
        const remaining = (state.conversationsByWorkspace[workspaceId] ?? []).filter(
          (c) => c.conversation_id !== conversationId
        );
        const activeConversationId =
          state.activeConversationId === conversationId
            ? (remaining[0]?.conversation_id ?? null)
            : state.activeConversationId;
        return {
          conversationsByWorkspace: {
            ...state.conversationsByWorkspace,
            [workspaceId]: remaining,
          },
          activeConversationId,
        };
      });
    },

    updateConversationName: (conversationId, name) => {
      set((state) => {
        const updated: Record<string, ConversationData[]> = {};
        for (const [wsId, convos] of Object.entries(state.conversationsByWorkspace)) {
          updated[wsId] = convos.map((c) =>
            c.conversation_id === conversationId ? { ...c, name } : c
          );
        }
        return { conversationsByWorkspace: updated };
      });
    },

    appendUserMessage: (conversationId, content) => {
      const id = nextMessageId();
      const message: ChatMessage = {
        id,
        role: 'user',
        content,
        isStreaming: false,
        timestamp: Date.now(),
      };
      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [
            ...(state.messagesByConversation[conversationId] ?? []),
            message,
          ],
        },
      }));
      return id;
    },

    startAssistantMessage: (conversationId) => {
      const id = nextMessageId();
      const message: ChatMessage = {
        id,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: Date.now(),
      };
      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [
            ...(state.messagesByConversation[conversationId] ?? []),
            message,
          ],
        },
      }));
      return id;
    },

    /**
     * Appends a token delta to the last streaming assistant message.
     */
    appendToken: (conversationId, delta) => {
      set((state) => {
        const messages = state.messagesByConversation[conversationId];
        if (!messages || messages.length === 0) return state;

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || !lastMessage.isStreaming) return state;

        const updated: ChatMessage = {
          ...lastMessage,
          content: lastMessage.content + delta,
        };
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [...messages.slice(0, -1), updated],
          },
        };
      });
    },

    finalizeAssistantMessage: (conversationId) => {
      set((state) => {
        const messages = state.messagesByConversation[conversationId];
        if (!messages || messages.length === 0) return state;

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || !lastMessage.isStreaming) return state;

        const finalized: ChatMessage = { ...lastMessage, isStreaming: false };
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [...messages.slice(0, -1), finalized],
          },
        };
      });
    },
  };
};
