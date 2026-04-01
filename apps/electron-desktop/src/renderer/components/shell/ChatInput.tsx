/**
 * ChatInput — Claude-style message composer.
 *
 * - Tall rounded container with inner textarea (auto-grows up to 160px)
 * - '+' button on bottom-left (non-functional, reserved for document upload)
 * - Send button on bottom-right (arrow up icon)
 * - Enter sends; Shift+Enter inserts newline
 * - Disabled while agent is streaming
 */

import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/index.js';

interface ChatInputProps {
  onSend: (message: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps): React.ReactElement {
  const isAgentStreaming = useAppStore((state) => state.isAgentStreaming);
  const [value, setValue] = React.useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(Math.max(scrollHeight, 44), 160)}px`;
  }, [value]);

  const handleSend = (): void => {
    const trimmed = value.trim();
    if (!trimmed || isAgentStreaming) return;
    setValue('');
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = Boolean(value.trim()) && !isAgentStreaming;

  return (
    <div
      style={{
        padding: '10px 14px 12px',
        background: 'var(--bg1)',
        borderTop: '0.5px solid var(--border)',
      }}
    >
      {/* Outer container — the "input card" */}
      <div
        style={{
          background: 'var(--bg2)',
          border: `1px solid ${canSend ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.15s',
          padding: '4px 6px 6px',
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isAgentStreaming ? 'Astra is working…' : 'Ask Astra anything… (Shift+Enter for newline)'}
          disabled={isAgentStreaming}
          rows={1}
          style={{
            flex: 1,
            minHeight: '44px',
            maxHeight: '160px',
            background: 'transparent',
            border: 'none',
            padding: '8px 6px 4px',
            color: isAgentStreaming ? 'var(--t2)' : 'var(--t0)',
            fontSize: '14px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            overflowY: 'auto',
          }}
        />

        {/* Bottom bar: attach + send */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '4px',
          }}
        >
          {/* Attach button (non-functional) */}
          <button
            type="button"
            title="Attach document (coming soon)"
            disabled
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'none',
              border: '1px solid var(--border)',
              cursor: 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--t3)',
              flexShrink: 0,
            }}
          >
            {/* Plus icon */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: canSend ? 'var(--accent-blue)' : 'var(--bg3)',
              border: 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            {/* Arrow up icon */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M6.5 11V2M6.5 2L2 6.5M6.5 2L11 6.5"
                stroke={canSend ? '#fff' : 'var(--t3)'}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Hint text */}
      <p style={{ fontSize: '10px', color: 'var(--t3)', textAlign: 'center', marginTop: '6px' }}>
        Astra can make mistakes. Review important information.
      </p>
    </div>
  );
}
