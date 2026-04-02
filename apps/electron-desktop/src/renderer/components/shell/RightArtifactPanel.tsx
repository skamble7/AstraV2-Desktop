/**
 * RightArtifactPanel — right column of the workspace shell.
 *
 * Three always-visible collapsible sections (top to bottom):
 *   1. Artifacts  — list of artifact cards for the current workspace
 *   2. Progress   — plan step indicators (PlanProgressBar)
 *   3. Context    — placeholder for future context display
 */

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/index.js';
import type { ArtifactData } from '../../ipc/ElectronApi.js';
import { getArtifactFileInfo } from '../../lib/utils.js';
import type { ArtifactIconType } from '../../lib/utils.js';
import { PlanProgressBar } from './PlanProgressBar.js';

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
// SectionHeader
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  open: boolean;
  onToggle: () => void;
}

function SectionHeader({ title, open, onToggle }: SectionHeaderProps): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '9px 12px',
        background: 'none',
        border: 'none',
        borderBottom: open ? '0.5px solid var(--border)' : 'none',
        borderRadius: open ? '0' : '8px',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--t1)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        style={{
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 0.15s',
          flexShrink: 0,
        }}
      >
        <path d="M3 5l4 4 4-4" stroke="var(--t2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
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
        <div style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '2px', lineHeight: 1.2 }}>
          {typeLabel}
        </div>
      </div>
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
  const planSteps = useAppStore((state) => state.currentPlanSteps);
  const fetchArtifacts = useAppStore((state) => state.fetchArtifacts);

  const [artifactsOpen, setArtifactsOpen] = useState(true);
  const [progressOpen, setProgressOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchArtifacts(currentWorkspaceId);
    }
  }, [currentWorkspaceId, fetchArtifacts]);

  return (
    <aside
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg1)',
        overflow: 'hidden',
        padding: '10px',
        gap: '20px',
      }}
    >
      {/* ── Artifacts ─────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: artifactsOpen ? 1 : '0 0 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '0.5px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--bg2)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader
          title="Artifacts"
          open={artifactsOpen}
          onToggle={() => setArtifactsOpen((v) => !v)}
        />
        {artifactsOpen && (
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 6px' }}>
            {artifacts.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--t2)', padding: '8px' }}>No artifacts yet</p>
            ) : (
              artifacts.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          border: '0.5px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--bg2)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader
          title="Progress"
          open={progressOpen}
          onToggle={() => setProgressOpen((v) => !v)}
        />
        {progressOpen && (
          <div style={{ padding: '8px 10px' }}>
            {planSteps.length > 0 ? (
              <PlanProgressBar />
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.5 }}>
                See task progress for longer tasks.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Context ───────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          border: '0.5px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--bg2)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader
          title="Context"
          open={contextOpen}
          onToggle={() => setContextOpen((v) => !v)}
        />
        {contextOpen && (
          <div style={{ padding: '8px 10px' }}>
            <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.5 }}>
              Track tools and referenced files used in this task.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
