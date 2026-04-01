import type { StateCreator } from 'zustand';
import type { ElectronAPI, SessionData } from '../../ipc/ElectronApi.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
  timestamp: number;
}

export interface ConversationSlice {
  sessionsByWorkspace: Record<string, SessionData[]>;
  activeSessionId: string | null;
  messagesBySession: Record<string, ChatMessage[]>;

  fetchSessions: (workspaceId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  createSession: (workspaceId: string) => Promise<SessionData>;

  appendUserMessage: (sessionId: string, content: string) => string;
  startAssistantMessage: (sessionId: string) => string;
  appendToken: (sessionId: string, delta: string) => void;
  finalizeAssistantMessage: (sessionId: string) => void;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export const createConversationSlice: StateCreator<ConversationSlice> = (set, get) => ({
  sessionsByWorkspace: {},
  activeSessionId: null,
  messagesBySession: {},

  fetchSessions: async (workspaceId) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const sessions = await api.listSessions(workspaceId);
    set((state) => ({
      sessionsByWorkspace: { ...state.sessionsByWorkspace, [workspaceId]: sessions },
    }));
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  createSession: async (workspaceId) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const session = await api.createSession(workspaceId, 'New conversation');
    set((state) => ({
      sessionsByWorkspace: {
        ...state.sessionsByWorkspace,
        [workspaceId]: [session, ...(state.sessionsByWorkspace[workspaceId] ?? [])],
      },
      activeSessionId: session.session_id,
      messagesBySession: {
        ...state.messagesBySession,
        [session.session_id]: [],
      },
    }));
    return session;
  },

  appendUserMessage: (sessionId, content) => {
    const id = nextMessageId();
    const message: ChatMessage = {
      id,
      role: 'user',
      content,
      isStreaming: false,
      timestamp: Date.now(),
    };
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [...(state.messagesBySession[sessionId] ?? []), message],
      },
    }));
    return id;
  },

  startAssistantMessage: (sessionId) => {
    const id = nextMessageId();
    const message: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [...(state.messagesBySession[sessionId] ?? []), message],
      },
    }));
    return id;
  },

  /**
   * Appends a token delta to the last streaming assistant message.
   * Uses immer-style mutation via the state setter — efficient for high-frequency updates.
   */
  appendToken: (sessionId, delta) => {
    set((state) => {
      const messages = state.messagesBySession[sessionId];
      if (!messages || messages.length === 0) return state;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || !lastMessage.isStreaming) return state;

      const updated: ChatMessage = { ...lastMessage, content: lastMessage.content + delta };
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...messages.slice(0, -1), updated],
        },
      };
    });
  },

  finalizeAssistantMessage: (sessionId) => {
    set((state) => {
      const messages = state.messagesBySession[sessionId];
      if (!messages || messages.length === 0) return state;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || !lastMessage.isStreaming) return state;

      const finalized: ChatMessage = { ...lastMessage, isStreaming: false };
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...messages.slice(0, -1), finalized],
        },
      };
    });

    // Clear active streaming session for the plan step display
    const { activeSessionId } = get();
    if (activeSessionId === sessionId) {
      // Session finalized — keep it active but streaming flag cleared
    }
  },
});
