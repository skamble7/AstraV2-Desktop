/**
 * ChatInput — Claude-style message composer.
 *
 * - Tall rounded container with inner textarea (auto-grows up to 160px)
 * - '+' button on bottom-left opens an attachment/action popup menu
 * - Send button on bottom-right (arrow up icon)
 * - Enter sends; Shift+Enter inserts newline
 * - Disabled while agent is streaming
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../store/index.js';

interface ChatInputProps {
  onSend: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Menu item icons
// ---------------------------------------------------------------------------

function IconPaperclip(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 7.5l-6 6a4 4 0 0 1-5.657-5.657l6.364-6.364a2.5 2.5 0 0 1 3.536 3.536L5.379 11.38a1 1 0 0 1-1.415-1.414l5.657-5.657" />
    </svg>
  );
}

function IconFolder(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4a1 1 0 0 1 1-1h3l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" />
    </svg>
  );
}

function IconSkills(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function IconMcp(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="2" x2="8" y2="4" />
      <line x1="8" y1="12" x2="8" y2="14" />
      <line x1="2" y1="8" x2="4" y2="8" />
      <line x1="12" y1="8" x2="14" y2="8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PlusMenu
// ---------------------------------------------------------------------------

interface MenuItem {
  icon: React.ReactElement;
  label: string;
  shortcut?: string;
  onClick: () => void;
}

function PlusMenu({ onClose }: { onClose: () => void }): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items: MenuItem[] = [
    {
      icon: <IconPaperclip />,
      label: 'Add files or images',
      shortcut: '⌘U',
      onClick: () => { onClose(); },
    },
    {
      icon: <IconFolder />,
      label: 'Add to Project',
      onClick: () => { onClose(); },
    },
    {
      icon: <IconSkills />,
      label: 'Skills',
      onClick: () => { onClose(); },
    },
    {
      icon: <IconMcp />,
      label: 'MCP Servers',
      onClick: () => { onClose(); },
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        width: '240px',
        background: 'var(--bg2)',
        border: '0.5px solid var(--border-strong)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-md)',
        padding: '6px',
        zIndex: 100,
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {/* Divider after first item */}
          {i === 1 && (
            <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 0' }} />
          )}
          <button
            onClick={item.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '9px 10px',
              background: 'none',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--t0)',
              fontSize: '13px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <span style={{ color: 'var(--t1)', flexShrink: 0 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ fontSize: '11px', color: 'var(--t2)', flexShrink: 0 }}>{item.shortcut}</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

export function ChatInput({ onSend }: ChatInputProps): React.ReactElement {
  const isAgentStreaming = useAppStore((state) => state.isAgentStreaming);
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusWrapRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

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
          {/* Plus button + popup menu */}
          <div ref={plusWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
            {menuOpen && <PlusMenu onClose={closeMenu} />}
            <button
              type="button"
              title="Add files, skills or servers"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: menuOpen ? 'var(--bg3)' : 'none',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--t1)',
                flexShrink: 0,
                transition: 'background 0.1s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="6.5" y1="1" x2="6.5" y2="12" />
                <line x1="1" y1="6.5" x2="12" y2="6.5" />
              </svg>
            </button>
          </div>

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
