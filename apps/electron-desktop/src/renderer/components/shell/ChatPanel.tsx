/**
 * ChatPanel — the center column of the workspace shell.
 *
 * Layout (top to bottom):
 * 1. SkillPackDock (pack selector + run button)
 * 2. Message thread (scrollable)
 * 3. InlineUserInputPrompt (visible when ask_user is active)
 * 4. ChatInput (always visible)
 *
 * PlanProgressBar has moved to the right panel (RightArtifactPanel › Progress section).
 */

import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/index.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatInput } from './ChatInput.js';
import { InlineUserInputPrompt } from './InlineUserInputPrompt.js';
import { PlanApprovalPrompt } from './PlanApprovalPrompt.js';
import { SkillPackDock } from './SkillPackDock.js';

interface ChatPanelProps {
  workspaceId: string;
  conversationId: string | null;
}

export function ChatPanel({ workspaceId, conversationId }: ChatPanelProps): React.ReactElement {
  const messages = useAppStore((state) =>
    conversationId ? (state.messagesByConversation[conversationId] ?? []) : []
  );
  const isAgentStreaming = useAppStore((state) => state.isAgentStreaming);
  const appendUserMessage = useAppStore((state) => state.appendUserMessage);
  const startAssistantMessage = useAppStore((state) => state.startAssistantMessage);
  const setAgentStreaming = useAppStore((state) => state.setAgentStreaming);
  const clearPlan = useAppStore((state) => state.clearPlan);
  const fetchMessages = useAppStore((state) => state.fetchMessages);
  const createConversation = useAppStore((state) => state.createConversation);
  const renameConversation = useAppStore((state) => state.renameConversation);

  const themeStyle = useAppStore((state) => state.themeStyle);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hydrate messages from the backend whenever the active conversation changes.
  // Skip if the key already exists in messagesByConversation — this means the conversation
  // was either created locally (createConversation initialises it to []) or already loaded.
  // Using `!== undefined` rather than `length > 0` ensures we skip even for fresh empty
  // conversations, preventing fetchMessages from racing with optimistically-appended messages.
  useEffect(() => {
    if (!conversationId) return;
    const existing = useAppStore.getState().messagesByConversation[conversationId];
    if (existing !== undefined) return;
    void fetchMessages(conversationId).catch((err: unknown) => {
      console.error('[ChatPanel] fetchMessages failed:', err);
    });
  }, [conversationId, fetchMessages]);

  // Auto-scroll to bottom on new messages / tokens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content?.length]);

  const handleSendMessage = async (content: string): Promise<void> => {
    // If no conversation is active, create one on-the-fly before sending.
    // This lets the user just type and hit send without clicking "New chat" first.
    let activeConvId = conversationId;
    if (!activeConvId) {
      const newConv = await createConversation(workspaceId);
      activeConvId = newConv.conversation_id;
    }

    const isFirstMessage = messages.length === 0;

    appendUserMessage(activeConvId, content);
    startAssistantMessage(activeConvId);
    setAgentStreaming(true, activeConvId);
    clearPlan();

    void window.electronAPI.sendMessage({
      workspace_id: workspaceId,
      message: content,
      session_id: activeConvId, // field name stays session_id for AgentIpcHandler compatibility
    });

    // Auto-name the conversation from the first message — best-effort, errors ignored
    if (isFirstMessage) {
      const trimmed = content.trim();
      const name = trimmed.length > 50
        ? (trimmed.slice(0, 50).replace(/\s+\S*$/, '') || trimmed.slice(0, 50))
        : trimmed;
      renameConversation(workspaceId, activeConvId, name).catch(() => { /* best-effort */ });
    }
  };

  const handleRunPack = (packKey: string, packVersion: string): void => {
    if (!conversationId) return;

    startAssistantMessage(conversationId);
    setAgentStreaming(true, conversationId);
    clearPlan();

    void window.electronAPI.runPack({
      workspace_id: workspaceId,
      pack_key: packKey,
      pack_version: packVersion,
      inputs: {},
      session_id: conversationId, // field name stays session_id for AgentIpcHandler compatibility
    });
  };

  const handleCancel = (): void => {
    void window.electronAPI.cancelRun(workspaceId);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg0)',
        borderLeft: '0.5px solid var(--border)',
        borderRight: '0.5px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Skill Pack Dock */}
      <SkillPackDock onRunPack={handleRunPack} />

      {/* Message Thread */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: themeStyle === 'newspaper' ? '32px 48px 16px 48px' : '16px 16px 8px 16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--t2)',
              fontSize: '13px',
              textAlign: 'center',
            }}
          >
            <div>
              <p style={{ marginBottom: '4px' }}>Start a conversation</p>
              <p style={{ fontSize: '12px' }}>Ask Astra to analyze, discover, or explain anything about this workspace</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Plan approval prompt — shown after planning, before execution */}
      <div style={{ padding: '0 12px' }}>
        <PlanApprovalPrompt />
      </div>

      {/* ask_user inline prompt */}
      <div style={{ padding: '0 12px' }}>
        <InlineUserInputPrompt />
      </div>

      {/* Cancel button (visible when streaming) */}
      {isAgentStreaming && (
        <div style={{ padding: '0 12px 6px 12px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '5px 12px',
              background: 'var(--bg3)',
              border: '0.5px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--t1)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Stop generating
          </button>
        </div>
      )}

      {/* Chat Input */}
      <ChatInput onSend={handleSendMessage} />
    </div>
  );
}
