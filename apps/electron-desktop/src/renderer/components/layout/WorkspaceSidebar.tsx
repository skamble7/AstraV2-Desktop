/**
 * WorkspaceSidebar — left column of the workspace shell (220px fixed).
 *
 * Sections:
 * 1. Workspace header (name + initials icon)
 * 2. Navigation items (Artifacts, Runs)
 * 3. Conversations list + New Conversation button
 *
 * Conversations list supports:
 * - message_count display
 * - Infinite scroll (loads more when scrolled to bottom and nextCursor is set)
 * - Inline rename on double-click
 * - Delete via right-click context menu with confirmation
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/index.js';
import { getInitials, getWorkspaceColor } from '../../lib/utils.js';

export function WorkspaceSidebar(): React.ReactElement {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const conversations = useAppStore((state) =>
    currentWorkspaceId
      ? (state.conversationsByWorkspace[currentWorkspaceId] ?? [])
      : []
  );
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const nextCursor = useAppStore((state) => state.nextCursor);
  const setActiveConversation = useAppStore((state) => state.setActiveConversation);
  const createConversation = useAppStore((state) => state.createConversation);
  const fetchConversations = useAppStore((state) => state.fetchConversations);
  const loadMoreConversations = useAppStore((state) => state.loadMoreConversations);
  const renameConversation = useAppStore((state) => state.renameConversation);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
  const navigateTo = useAppStore((state) => state.navigateTo);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    conversationId: string;
    x: number;
    y: number;
  } | null>(null);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Scroll container ref for infinite scroll
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchConversations(currentWorkspaceId);
    }
  }, [currentWorkspaceId, fetchConversations]);

  // Infinite scroll: detect when user is near the bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = (): void => {
      if (!currentWorkspaceId || !nextCursor) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 40) {
        void loadMoreConversations(currentWorkspaceId);
      }
    };

    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [currentWorkspaceId, nextCursor, loadMoreConversations]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (): void => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleNewConversation = async (): Promise<void> => {
    if (!currentWorkspaceId) return;
    await createConversation(currentWorkspaceId);
  };

  const startRename = (conversationId: string, currentTitle: string): void => {
    setRenamingId(conversationId);
    setRenameValue(currentTitle);
  };

  const commitRename = async (): Promise<void> => {
    if (!renamingId || !currentWorkspaceId) {
      setRenamingId(null);
      return;
    }
    const trimmed = renameValue.trim();
    if (trimmed) {
      await renameConversation(currentWorkspaceId, renamingId, trimmed);
    }
    setRenamingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      void commitRename();
    } else if (e.key === 'Escape') {
      setRenamingId(null);
    }
  };

  const openContextMenu = (
    e: React.MouseEvent,
    conversationId: string
  ): void => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ conversationId, x: e.clientX, y: e.clientY });
  };

  const confirmDelete = (conversationId: string): void => {
    setContextMenu(null);
    setDeleteConfirmId(conversationId);
  };

  const executeDelete = async (): Promise<void> => {
    if (!deleteConfirmId || !currentWorkspaceId) {
      setDeleteConfirmId(null);
      return;
    }
    await deleteConversation(currentWorkspaceId, deleteConfirmId);
    setDeleteConfirmId(null);
  };

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg1)',
        borderRight: '0.5px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Workspace header */}
      {activeWorkspace && (
        <div
          style={{
            padding: '14px 12px',
            borderBottom: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: getWorkspaceColor(activeWorkspace.name),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {getInitials(activeWorkspace.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeWorkspace.name}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--t2)' }}>{activeWorkspace.domain_type}</p>
          </div>
        </div>
      )}

      {/* Top action: New chat */}
      <div style={{ padding: '10px 8px 4px' }}>
        <button
          onClick={() => void handleNewConversation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 10px',
            background: 'none',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--t0)',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New chat
        </button>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 10px',
            background: 'none',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--t1)',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Search
        </button>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 10px',
            background: 'none',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--t1)',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect x="2" y="7" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="3.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="10.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <circle cx="5.5" cy="4.25" r="1.5" fill="var(--bg1)" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="10.5" cy="7.75" r="1.5" fill="var(--bg1)" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="6.5" cy="11.25" r="1.5" fill="var(--bg1)" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Customize
        </button>
      </div>

      <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 8px' }} />

      {/* Primary nav items */}
      <div style={{ padding: '4px 8px' }}>
        {([
          {
            label: 'Chats',
            screen: 'workspace' as const,
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v7A1.5 1.5 0 0 1 12.5 12H9l-3 2v-2H3.5A1.5 1.5 0 0 1 2 10.5v-7Z" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            ),
          },
          {
            label: 'Orbits',
            screen: 'workspace' as const,
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                <ellipse cx="8" cy="8" rx="6" ry="3" stroke="currentColor" strokeWidth="1.3"/>
                <ellipse cx="8" cy="8" rx="6" ry="3" transform="rotate(60 8 8)" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            ),
          },
          {
            label: 'Artifacts',
            screen: 'artifact-detail' as const,
            icon: (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="8.5" y="2" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="2" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            ),
          },
        ] as { label: string; screen: 'workspace' | 'artifact-detail'; icon: React.ReactElement }[]).map((item) => (
          <button
            key={item.label}
            onClick={() => {
              if (currentWorkspaceId) navigateTo(item.screen, currentWorkspaceId);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '8px 10px',
              background: 'none',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--t1)',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 8px' }} />

      {/* Recents section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 8px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t2)', padding: '6px 8px 4px', letterSpacing: '0.04em' }}>
          Recents
        </p>

        <div ref={listRef} style={{ flex: 1, overflow: 'auto' }}>
          {conversations.map((conversation) => {
            const isActive = activeConversationId === conversation.conversation_id;
            const isRenaming = renamingId === conversation.conversation_id;

            return (
              <div
                key={conversation.conversation_id}
                onContextMenu={(e) => openContextMenu(e, conversation.conversation_id)}
                style={{ position: 'relative' }}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={handleRenameKeyDown}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '5px 8px',
                      fontSize: '12px',
                      background: 'var(--bg2)',
                      border: '1px solid var(--accent-blue)',
                      borderRadius: '7px',
                      color: 'var(--t0)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setActiveConversation(conversation.conversation_id)}
                    onDoubleClick={() =>
                      startRename(
                        conversation.conversation_id,
                        conversation.name ?? 'Untitled conversation'
                      )
                    }
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 8px 2px 8px',
                      background: isActive ? 'var(--bg2)' : 'none',
                      border: 'none',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'none';
                    }}
                  >
                    <p
                      style={{
                        fontSize: '12px',
                        color: isActive ? 'var(--t0)' : 'var(--t1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        margin: 0,
                      }}
                    >
                      {conversation.name ?? 'Untitled conversation'}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        color: 'var(--t3)',
                        margin: '1px 0 4px 0',
                      }}
                    >
                      {conversation.message_count > 0
                        ? `${conversation.message_count} message${conversation.message_count === 1 ? '' : 's'}`
                        : 'No messages'}
                    </p>
                  </button>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: 'var(--bg2)',
            border: '0.5px solid var(--border)',
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '140px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => confirmDelete(contextMenu.conversationId)}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              background: 'none',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--red, #e53e3e)',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            style={{
              background: 'var(--bg1)',
              border: '0.5px solid var(--border)',
              borderRadius: '12px',
              padding: '20px 24px',
              maxWidth: '320px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t0)', marginBottom: '8px' }}>
              Delete conversation?
            </p>
            <p style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '16px' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{
                  padding: '6px 14px',
                  background: 'none',
                  border: '0.5px solid var(--border)',
                  borderRadius: '7px',
                  color: 'var(--t1)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void executeDelete()}
                style={{
                  padding: '6px 14px',
                  background: 'var(--red, #e53e3e)',
                  border: 'none',
                  borderRadius: '7px',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
