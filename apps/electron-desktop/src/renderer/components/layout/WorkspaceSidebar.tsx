/**
 * WorkspaceSidebar — left column of the workspace shell (220px fixed).
 *
 * Sections:
 * 1. Workspace header (name + initials icon)
 * 2. Navigation items (Artifacts, Runs)
 * 3. Conversations list + New Conversation button
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../../store/index.js';
import { getInitials, getWorkspaceColor } from '../../lib/utils.js';

export function WorkspaceSidebar(): React.ReactElement {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const sessions = useAppStore((state) =>
    currentWorkspaceId ? (state.sessionsByWorkspace[currentWorkspaceId] ?? []) : []
  );
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSession = useAppStore((state) => state.setActiveSession);
  const createSession = useAppStore((state) => state.createSession);
  const fetchSessions = useAppStore((state) => state.fetchSessions);
  const navigateTo = useAppStore((state) => state.navigateTo);

  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchSessions(currentWorkspaceId);
    }
  }, [currentWorkspaceId, fetchSessions]);

  const handleNewConversation = async (): Promise<void> => {
    if (!currentWorkspaceId) return;
    await createSession(currentWorkspaceId);
  };

  const navItems = [
    { label: 'Artifacts', icon: '◎', screen: 'artifact-detail' as const },
    { label: 'Runs', icon: '↺', screen: 'workspace' as const },
  ];

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

      {/* Navigation */}
      <div style={{ padding: '8px 6px' }}>
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              if (currentWorkspaceId) navigateTo(item.screen, currentWorkspaceId);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '7px 8px',
              background: 'none',
              border: 'none',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--t1)',
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ fontSize: '14px', width: '16px', textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ height: '0.5px', background: 'var(--border)', margin: '4px 0' }} />

      {/* Conversations section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 6px' }}>
        <p style={{ fontSize: '11px', color: 'var(--t2)', padding: '6px 8px 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Conversations
        </p>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {sessions.map((session) => (
            <button
              key={session.session_id}
              onClick={() => setActiveSession(session.session_id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 8px',
                background: activeSessionId === session.session_id ? 'var(--bg2)' : 'none',
                border: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                fontSize: '12px',
                color: activeSessionId === session.session_id ? 'var(--t0)' : 'var(--t1)',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (activeSessionId !== session.session_id)
                  e.currentTarget.style.background = 'var(--bg2)';
              }}
              onMouseLeave={(e) => {
                if (activeSessionId !== session.session_id)
                  e.currentTarget.style.background = 'none';
              }}
            >
              {session.title ?? 'Untitled conversation'}
            </button>
          ))}
        </div>

        <button
          onClick={() => void handleNewConversation()}
          style={{
            padding: '7px 8px',
            background: 'none',
            border: '0.5px solid var(--border)',
            borderRadius: '7px',
            color: 'var(--t1)',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '4px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          + New conversation
        </button>
      </div>
    </aside>
  );
}
