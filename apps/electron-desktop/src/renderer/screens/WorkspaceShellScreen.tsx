/**
 * WorkspaceShellScreen — 3-column layout for the main working area.
 *
 * │ WorkspaceSidebar (220px) │ ChatPanel (flex) │ RightArtifactPanel (268px) │
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../store/index.js';
import { WorkspaceSidebar } from '../components/layout/WorkspaceSidebar.js';
import { ChatPanel } from '../components/shell/ChatPanel.js';
import { RightArtifactPanel } from '../components/shell/RightArtifactPanel.js';

export function WorkspaceShellScreen(): React.ReactElement {
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) =>
    currentWorkspaceId ? (state.sessionsByWorkspace[currentWorkspaceId] ?? []) : []
  );
  const createSession = useAppStore((state) => state.createSession);
  const setActiveSession = useAppStore((state) => state.setActiveSession);

  // Ensure there is an active session when the screen mounts
  useEffect(() => {
    if (!currentWorkspaceId) return;

    if (sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0]!.session_id);
    } else if (sessions.length === 0) {
      void createSession(currentWorkspaceId);
    }
  }, [currentWorkspaceId, sessions, activeSessionId, createSession, setActiveSession]);

  if (!currentWorkspaceId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>
        No workspace selected
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <WorkspaceSidebar />
      <ChatPanel workspaceId={currentWorkspaceId} sessionId={activeSessionId} />
      <RightArtifactPanel />
    </div>
  );
}
