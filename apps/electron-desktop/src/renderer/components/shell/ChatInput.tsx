/**
 * ChatInput — auto-growing textarea for composing messages.
 *
 * - Min height 36px, max height 80px (auto-grows in between)
 * - Enter sends; Shift+Enter inserts newline
 * - Disabled while agent is streaming
 * - Send button turns blue when input is non-empty
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
    textarea.style.height = `${Math.min(Math.max(scrollHeight, 36), 80)}px`;
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        padding: '10px 12px',
        background: 'var(--bg1)',
        borderTop: '0.5px solid var(--border)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isAgentStreaming ? 'Astra is working…' : 'Ask Astra anything…'}
        disabled={isAgentStreaming}
        rows={1}
        style={{
          flex: 1,
          minHeight: '36px',
          maxHeight: '80px',
          background: 'var(--bg2)',
          border: '0.5px solid var(--border)',
          borderRadius: '9px',
          padding: '8px 10px',
          color: isAgentStreaming ? 'var(--t2)' : 'var(--t0)',
          fontSize: '13px',
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.4,
          overflowY: 'auto',
        }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || isAgentStreaming}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '9px',
          background: value.trim() && !isAgentStreaming ? 'var(--accent-blue)' : 'var(--bg3)',
          border: 'none',
          cursor: value.trim() && !isAgentStreaming ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 7L12 7M12 7L7 2M12 7L7 12"
            stroke={value.trim() && !isAgentStreaming ? '#fff' : 'var(--t2)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
