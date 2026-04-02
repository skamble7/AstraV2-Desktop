/**
 * ChatMessage — renders a single message bubble.
 *
 * Rules:
 * - While isStreaming === true: render content as plain text (no markdown parse) to avoid flicker
 * - While isStreaming === false: render with react-markdown for formatted output
 * - VS Code style: chat bubbles, left (assistant) / right (user) alignment
 * - Newspaper style: editorial layout — full-width, left-aligned, byline + hairline, serif body
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '../../store/slices/conversationSlice.js';
import { useAppStore } from '../../store/index.js';

interface ChatMessageProps {
  message: ChatMessageType;
}

// ─── VS Code Style ────────────────────────────────────────────────────────────

function VsCodeMessage({ message }: ChatMessageProps): React.ReactElement {
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

// ─── Newspaper Style ──────────────────────────────────────────────────────────

function NewspaperMessage({ message }: ChatMessageProps): React.ReactElement {
  const isAssistant = message.role === 'assistant';

  // User messages: right-aligned bubble (like Claude desktop)
  if (!isAssistant) {
    return (
      <div
        style={{
          width: '100%',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            maxWidth: '72%',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border-strong)',
            borderRadius: '16px 4px 16px 16px',
            padding: '12px 16px',
            fontSize: '15px',
            lineHeight: 1.7,
            color: 'var(--t0)',
            fontFamily: 'Georgia, "Times New Roman", "Palatino Linotype", serif',
            wordBreak: 'break-word',
          }}
        >
          {message.isStreaming ? message.content : (
            <div className="markdown-content">
              <ReactMarkdown>{message.content || '\u00a0'}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant messages: editorial layout — byline + hairline rule + full-width serif body
  return (
    <div style={{ width: '100%', marginBottom: '32px' }}>

      {/* Byline row: label + hairline rule */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--accent-blue)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            flexShrink: 0,
          }}
        >
          ASTRA
        </span>
        <div
          style={{
            flex: 1,
            height: '0.5px',
            background: 'var(--border-strong)',
          }}
        />
      </div>

      {/* Body content */}
      <div
        style={{
          fontSize: '16px',
          lineHeight: 1.8,
          color: 'var(--t0)',
          fontFamily: 'Georgia, "Times New Roman", "Palatino Linotype", serif',
          wordBreak: 'break-word',
        }}
      >
        {message.isStreaming ? (
          <span>
            {message.content}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="var(--accent-blue)"
              style={{
                display: 'inline-block',
                marginLeft: '4px',
                verticalAlign: 'middle',
                flexShrink: 0,
                animation: 'astra-star-pulse 1.1s ease-in-out infinite',
              }}
            >
              <path d="M6 0 L7.1 4.9 L12 6 L7.1 7.1 L6 12 L4.9 7.1 L0 6 L4.9 4.9 Z" />
            </svg>
          </span>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown>{message.content || '\u00a0'}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ChatMessage ──────────────────────────────────────────────────────────────

export function ChatMessage({ message }: ChatMessageProps): React.ReactElement {
  const themeStyle = useAppStore((s) => s.themeStyle);

  if (themeStyle === 'newspaper') {
    return <NewspaperMessage message={message} />;
  }
  return <VsCodeMessage message={message} />;
}
