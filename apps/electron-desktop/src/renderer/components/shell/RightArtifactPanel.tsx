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
import { getArtifactFileInfo } from '../../lib/utils.js';
import type { ArtifactIconType } from '../../lib/utils.js';

// ---------------------------------------------------------------------------
// SVG icon components
// ---------------------------------------------------------------------------

function ArtifactFileIcon({ iconType, size = 18 }: { iconType: ArtifactIconType; size?: number }): React.ReactElement {
  const color = 'var(--t0)';

  if (iconType === 'code') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M12 3v3h3" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M8 10l-2 2 2 2M12 10l2 2-2 2" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconType === 'diagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <rect x="7" y="2" width="6" height="4" rx="1" stroke={color} strokeWidth="1.25" />
        <rect x="2" y="13" width="6" height="4" rx="1" stroke={color} strokeWidth="1.25" />
        <rect x="12" y="13" width="6" height="4" rx="1" stroke={color} strokeWidth="1.25" />
        <path d="M10 6v3M10 9l-5 4M10 9l5 4" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }

  // 'document' (default)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M12 3v3h3" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M7 10h6M7 13h4" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ size = 14 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4a1 1 0 0 1 1-1h3l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
        stroke="var(--t2)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ArtifactCard
// ---------------------------------------------------------------------------

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

  const displayName = artifact.kind.split('.').slice(2).join(' ')
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || artifact.kind;

  const { iconType, typeLabel } = getArtifactFileInfo(artifact);

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
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
      {/* File-type icon container */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'var(--bg3)',
          border: '0.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ArtifactFileIcon iconType={iconType} size={18} />
      </div>

      {/* Name + type label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--t0)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--t2)',
            marginTop: '2px',
            lineHeight: 1.2,
          }}
        >
          {typeLabel}
        </div>
      </div>

      {/* Folder icon */}
      <FolderIcon size={14} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// RightArtifactPanel
// ---------------------------------------------------------------------------

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
