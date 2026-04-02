/**
 * ChatMessage — renders a single message bubble.
 *
 * Rules:
 * - While isStreaming === true: render content as plain text (no markdown parse) to avoid flicker
 * - While isStreaming === false: render with react-markdown for formatted output
 * - Assistant messages appear on the left with a blue avatar
 * - User messages appear on the right with initials avatar
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '../../store/slices/conversationSlice.js';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps): React.ReactElement {
  const isAssistant = message.role === 'assistant';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        marginBottom: '12px',
        gap: '8px',
        alignItems: 'flex-start',
      }}
    >
      {/* Assistant avatar */}
      {isAssistant && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="white" strokeWidth="1.2" />
            <path d="M4 7L7 4L10 7L7 10Z" stroke="white" strokeWidth="1" fill="none" />
            <circle cx="7" cy="7" r="1.5" fill="white" />
          </svg>
        </div>
      )}

      {/* Message bubble */}
      <div
        style={{
          maxWidth: '75%',
          padding: '10px 12px',
          borderRadius: isAssistant ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          background: isAssistant ? 'var(--bg2)' : 'rgba(74, 158, 255, 0.12)',
          border: `0.5px solid ${isAssistant ? 'var(--border)' : 'rgba(74, 158, 255, 0.3)'}`,
          fontSize: '13px',
          lineHeight: 1.55,
          color: 'var(--t0)',
          position: 'relative',
        }}
      >
        {message.isStreaming ? (
          <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="var(--accent-blue)"
              style={{
                display: 'inline-block',
                marginLeft: '3px',
                verticalAlign: 'middle',
                flexShrink: 0,
                animation: 'astra-star-pulse 1.1s ease-in-out infinite',
              }}
            >
              <path d="M6 0 L7.1 4.9 L12 6 L7.1 7.1 L6 12 L4.9 7.1 L0 6 L4.9 4.9 Z" />
            </svg>
          </pre>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown>{message.content || '\u00a0'}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* User avatar */}
      {!isAssistant && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--bg4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--t0)',
            marginTop: '2px',
          }}
        >
          U
        </div>
      )}
    </div>
  );
}
