/**
 * RightArtifactPanel — right column of the workspace shell (268px fixed).
 *
 * Two tabs:
 * - Artifacts: list of artifact cards for the current workspace
 * - Context: placeholder for future context display
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../../store/index.js';
import type { ArtifactData } from '../../ipc/ElectronApi.js';

function CategoryPill({ kind }: { kind: string }): React.ReactElement {
  const category = kind.split('.')[1] ?? 'general';
  const colorMap: Record<string, string> = {
    architecture: 'var(--accent-blue)',
    agile: 'var(--accent-green)',
    catalog: 'var(--accent-purple)',
    data: 'var(--accent-amber)',
    security: 'var(--accent-red)',
  };
  const color = colorMap[category] ?? 'var(--t2)';

  return (
    <span
      style={{
        fontSize: '10px',
        padding: '1px 6px',
        borderRadius: 'var(--radius-pill)',
        background: `${color}22`,
        color,
        border: `0.5px solid ${color}44`,
      }}
    >
      {category}
    </span>
  );
}

function ArtifactCard({ artifact }: { artifact: ArtifactData }): React.ReactElement {
  const selectArtifact = useAppStore((state) => state.selectArtifact);
  const selectedArtifactId = useAppStore((state) => state.selectedArtifactId);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const isSelected = selectedArtifactId === artifact.id;

  const handleClick = (): void => {
    selectArtifact(artifact.id);
    if (currentWorkspaceId) {
      navigateTo('artifact-detail', currentWorkspaceId);
    }
  };

  // Derive a display name from the kind
  const displayName = artifact.kind.split('.').slice(2).join(' ')
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || artifact.kind;

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        width: '100%',
        padding: '8px 10px',
        background: isSelected ? 'var(--bg3)' : 'none',
        border: 'none',
        borderRadius: '7px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--bg2)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayName}
        </span>
        <CategoryPill kind={artifact.kind} />
      </div>

      {/* Representation dots */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {artifact.narrative && (
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-amber)' }} title="Narrative" />
        )}
        {artifact.diagram && (
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-purple)' }} title="Diagram" />
        )}
        {artifact.data && (
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-blue)' }} title="Data" />
        )}
      </div>
    </button>
  );
}

export function RightArtifactPanel({ width = 280 }: { width?: number }): React.ReactElement {
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const artifacts = useAppStore((state) =>
    currentWorkspaceId ? (state.artifactsByWorkspace[currentWorkspaceId] ?? []) : []
  );
  const rightPanelTab = useAppStore((state) => state.rightPanelTab);
  const setRightPanelTab = useAppStore((state) => state.setRightPanelTab);
  const fetchArtifacts = useAppStore((state) => state.fetchArtifacts);

  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchArtifacts(currentWorkspaceId);
    }
  }, [currentWorkspaceId, fetchArtifacts]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '7px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    color: active ? 'var(--t0)' : 'var(--t2)',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <aside
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg1)',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)' }}>
        <button style={tabStyle(rightPanelTab === 'artifacts')} onClick={() => setRightPanelTab('artifacts')}>
          Artifacts
        </button>
        <button style={tabStyle(rightPanelTab === 'context')} onClick={() => setRightPanelTab('context')}>
          Context
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
        {rightPanelTab === 'artifacts' && (
          <>
            {artifacts.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--t2)', padding: '8px' }}>No artifacts yet</p>
            ) : (
              artifacts.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))
            )}
          </>
        )}
        {rightPanelTab === 'context' && (
          <p style={{ fontSize: '12px', color: 'var(--t2)', padding: '8px' }}>Context coming soon</p>
        )}
      </div>
    </aside>
  );
}
