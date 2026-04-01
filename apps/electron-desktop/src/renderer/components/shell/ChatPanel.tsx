/**
 * ChatPanel — the center column of the workspace shell.
 *
 * Layout (top to bottom):
 * 1. SkillPackDock (pack selector + run button)
 * 2. Message thread (scrollable)
 * 3. PlanProgressBar (visible when agent is running)
 * 4. InlineUserInputPrompt (visible when ask_user is active)
 * 5. ChatInput (always visible)
 */

import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/index.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatInput } from './ChatInput.js';
import { PlanProgressBar } from './PlanProgressBar.js';
import { InlineUserInputPrompt } from './InlineUserInputPrompt.js';
import { SkillPackDock } from './SkillPackDock.js';

interface ChatPanelProps {
  workspaceId: string;
  sessionId: string | null;
}

export function ChatPanel({ workspaceId, sessionId }: ChatPanelProps): React.ReactElement {
  const messages = useAppStore((state) =>
    sessionId ? (state.messagesBySession[sessionId] ?? []) : []
  );
  const isAgentStreaming = useAppStore((state) => state.isAgentStreaming);
  const appendUserMessage = useAppStore((state) => state.appendUserMessage);
  const startAssistantMessage = useAppStore((state) => state.startAssistantMessage);
  const setAgentStreaming = useAppStore((state) => state.setAgentStreaming);
  const clearPlan = useAppStore((state) => state.clearPlan);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / tokens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content?.length]);

  const handleSendMessage = (content: string): void => {
    if (!sessionId) return;

    appendUserMessage(sessionId, content);
    startAssistantMessage(sessionId);
    setAgentStreaming(true, sessionId);
    clearPlan();

    void window.electronAPI.sendMessage({
      workspace_id: workspaceId,
      message: content,
      session_id: sessionId,
    });
  };

  const handleRunPack = (packKey: string, packVersion: string): void => {
    if (!sessionId) return;

    startAssistantMessage(sessionId);
    setAgentStreaming(true, sessionId);
    clearPlan();

    void window.electronAPI.runPack({
      workspace_id: workspaceId,
      pack_key: packKey,
      pack_version: packVersion,
      inputs: {},
      session_id: sessionId,
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
          padding: '16px 16px 8px 16px',
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

      {/* Plan Progress */}
      <div style={{ padding: '0 12px' }}>
        <PlanProgressBar />
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
