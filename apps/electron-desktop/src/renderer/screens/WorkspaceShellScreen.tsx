/**
 * WorkspaceShellScreen — 3-column layout for the main working area.
 *
 * │ WorkspaceSidebar (220px) │ ChatPanel (flex) │ drag-handle │ RightArtifactPanel (resizable) │
 *
 * The right panel is resizable via a drag-handle (min 200px, max 480px).
 * Default width is 280px.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { WorkspaceSidebar } from '../components/layout/WorkspaceSidebar.js';
import { ChatPanel } from '../components/shell/ChatPanel.js';
import { RightArtifactPanel } from '../components/shell/RightArtifactPanel.js';
import { CustomizePanel } from '../components/customize/CustomizePanel.js';

const RIGHT_PANEL_MIN = 200;
const RIGHT_PANEL_MAX = 480;
const RIGHT_PANEL_DEFAULT = 280;

export function WorkspaceShellScreen(): React.ReactElement {
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const setActiveConversation = useAppStore((state) => state.setActiveConversation);
  const fetchConversations = useAppStore((state) => state.fetchConversations);

  // Right panel width — persisted in localStorage
  const [rightWidth, setRightWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('astra:rightPanelWidth');
      if (stored) {
        const n = parseInt(stored, 10);
        if (n >= RIGHT_PANEL_MIN && n <= RIGHT_PANEL_MAX) return n;
      }
    } catch { /* ignore */ }
    return RIGHT_PANEL_DEFAULT;
  });

  const [showCustomize, setShowCustomize] = useState(false);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const currentWidth = useRef(rightWidth);
  currentWidth.current = rightWidth;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = currentWidth.current;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX; // dragging left = larger panel
      const newWidth = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, startWidth.current + delta));
      setRightWidth(newWidth);
    };

    const onMouseUp = (): void => {
      if (!isDragging.current) return;
      isDragging.current = false;
      try {
        localStorage.setItem('astra:rightPanelWidth', String(currentWidth.current));
      } catch { /* ignore */ }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Fetch conversations on workspace open and select the first if any exist.
  // Reset active conversation immediately so we never show a stale conversation
  // from the previous workspace while the fetch is in flight.
  useEffect(() => {
    if (!currentWorkspaceId) return;

    setActiveConversation(null);

    void (async () => {
      try {
        await fetchConversations(currentWorkspaceId);
      } catch (err) {
        console.error('[WorkspaceShellScreen] fetchConversations failed:', err);
      }
      const latestConversations =
        useAppStore.getState().conversationsByWorkspace[currentWorkspaceId] ?? [];
      if (latestConversations.length > 0) {
        setActiveConversation(latestConversations[0]!.conversation_id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  if (!currentWorkspaceId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>
        No workspace selected
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <WorkspaceSidebar
        onCustomize={() => setShowCustomize((v) => !v)}
        isCustomizeActive={showCustomize}
      />

      {showCustomize ? (
        <CustomizePanel onBack={() => setShowCustomize(false)} />
      ) : (
        <>
          <ChatPanel workspaceId={currentWorkspaceId} conversationId={activeConversationId} />

          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            title="Drag to resize"
            style={{
              width: '12px',
              flexShrink: 0,
              cursor: 'col-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg1)',
              borderLeft: '0.5px solid var(--border)',
              borderRight: '0.5px solid var(--border)',
              userSelect: 'none',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              const grip = e.currentTarget.querySelector('.grip-pill') as HTMLElement | null;
              if (grip) grip.style.background = 'var(--accent-blue)';
            }}
            onMouseLeave={(e) => {
              const grip = e.currentTarget.querySelector('.grip-pill') as HTMLElement | null;
              if (grip) grip.style.background = 'var(--border-strong)';
            }}
          >
            <div
              className="grip-pill"
              style={{
                width: '4px',
                height: '32px',
                borderRadius: '2px',
                background: 'var(--border-strong)',
                transition: 'background 0.15s',
                pointerEvents: 'none',
              }}
            />
          </div>

          <RightArtifactPanel width={rightWidth} />
        </>
      )}
    </div>
  );
}
