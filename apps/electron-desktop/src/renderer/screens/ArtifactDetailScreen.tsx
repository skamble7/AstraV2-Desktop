/**
 * ArtifactDetailScreen — 2-panel layout for exploring artifacts in a workspace.
 *
 * │ ArtifactList (280px) │ ArtifactDetailPane (flex) │
 *
 * The left panel lists all artifacts for the current workspace.
 * The right panel shows the selected artifact's representations via tabs.
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../store/index.js';
import type { ArtifactData } from '../ipc/ElectronApi.js';
import type { RepresentationTab } from '../store/slices/artifactSlice.js';
import { NarrativeTab } from '../components/artifacts/tabs/NarrativeTab.js';
import { DiagramTab } from '../components/artifacts/tabs/DiagramTab.js';
import { DataTab } from '../components/artifacts/tabs/DataTab.js';
import { FilesTab } from '../components/artifacts/tabs/FilesTab.js';
import { getArtifactFileInfo } from '../lib/utils.js';
import type { ArtifactIconType } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// Icon component
// ---------------------------------------------------------------------------

function ArtifactFileIconSmall({ iconType }: { iconType: ArtifactIconType }): React.ReactElement {
  const size = 14;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable display name from a cam.* kind identifier.
 *  e.g. "cam.agile.user_story" → "User Story"
 */
function kindToDisplayName(kind: string): string {
  const segments = kind.split('.');
  const last = segments[segments.length - 1] ?? kind;
  return last
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Derive a category from a cam.* kind identifier.
 *  e.g. "cam.agile.user_story" → "agile"
 */
function kindToCategory(kind: string): string {
  const segments = kind.split('.');
  return segments[1] ?? 'general';
}

// Stable color palette — maps category names to accent variables
const CATEGORY_COLORS: Record<string, string> = {
  agile: 'var(--accent-blue)',
  diagram: 'var(--accent-purple)',
  narrative: 'var(--accent-amber)',
  data: 'var(--accent-green)',
  report: 'var(--accent-teal)',
  analysis: 'var(--accent-pink)',
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'var(--t2)';
}

// Which tabs have data for a given artifact
function availableTabs(artifact: ArtifactData): RepresentationTab[] {
  const tabs: RepresentationTab[] = [];
  if (artifact.narrative) tabs.push('narrative');
  if (artifact.diagram) tabs.push('diagram');
  if (artifact.data !== undefined && artifact.data !== null) tabs.push('data');
  tabs.push('files');
  return tabs;
}

const TAB_LABELS: Record<RepresentationTab, string> = {
  narrative: 'Narrative',
  diagram: 'Diagram',
  data: 'Data',
  files: 'Files',
};

const TAB_COLORS: Record<RepresentationTab, string> = {
  narrative: 'var(--accent-amber)',
  diagram: 'var(--accent-purple)',
  data: 'var(--accent-blue)',
  files: 'var(--t2)',
};

// ---------------------------------------------------------------------------
// ArtifactListItem
// ---------------------------------------------------------------------------

interface ArtifactListItemProps {
  artifact: ArtifactData;
  isSelected: boolean;
  onSelect: () => void;
}

function ArtifactListItem({ artifact, isSelected, onSelect }: ArtifactListItemProps): React.ReactElement {
  const category = kindToCategory(artifact.kind);
  const displayName = kindToDisplayName(artifact.kind);
  const tabs = availableTabs(artifact);
  const { iconType } = getArtifactFileInfo(artifact);

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: isSelected ? 'var(--bg3)' : 'transparent',
        border: 'none',
        borderLeft: isSelected ? `2px solid var(--accent-blue)` : '2px solid transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ArtifactFileIconSmall iconType={iconType} />
        </div>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: isSelected ? 'var(--t0)' : 'var(--t1)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '4px', paddingLeft: '34px' }}>
        {tabs.map((tab) => (
          <div
            key={tab}
            title={TAB_LABELS[tab]}
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: TAB_COLORS[tab],
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: '10px',
          color: 'var(--t2)',
          paddingLeft: '34px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {category}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ArtifactDetailPane
// ---------------------------------------------------------------------------

interface ArtifactDetailPaneProps {
  artifact: ArtifactData;
  activeTab: RepresentationTab;
  onTabChange: (tab: RepresentationTab) => void;
}

function ArtifactDetailPane({ artifact, activeTab, onTabChange }: ArtifactDetailPaneProps): React.ReactElement {
  const tabs = availableTabs(artifact);

  // If the active tab is not available for this artifact, default to the first available
  const resolvedTab = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? 'data');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 20px 0',
          borderBottom: '0.5px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'var(--bg3)',
              border: '0.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArtifactFileIconSmall iconType={getArtifactFileInfo(artifact).iconType} />
          </div>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t0)', margin: 0 }}>
            {kindToDisplayName(artifact.kind)}
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--t2)', marginLeft: 'auto' }}>
            v{artifact.version}
          </span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: resolvedTab === tab ? 600 : 400,
                color: resolvedTab === tab ? 'var(--t0)' : 'var(--t2)',
                background: 'transparent',
                border: 'none',
                borderBottom: resolvedTab === tab ? `2px solid var(--accent-blue)` : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'color 0.1s',
              }}
            >
              <div
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: TAB_COLORS[tab],
                }}
              />
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {resolvedTab === 'narrative' && <NarrativeTab narrative={artifact.narrative} />}
        {resolvedTab === 'diagram' && <DiagramTab diagram={artifact.diagram} />}
        {resolvedTab === 'data' && <DataTab data={artifact.data} />}
        {resolvedTab === 'files' && <FilesTab artifactId={artifact.id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArtifactDetailScreen
// ---------------------------------------------------------------------------

export function ArtifactDetailScreen(): React.ReactElement {
  const currentWorkspaceId = useAppStore((state) => state.currentWorkspaceId);
  const artifactsByWorkspace = useAppStore((state) => state.artifactsByWorkspace);
  const selectedArtifactId = useAppStore((state) => state.selectedArtifactId);
  const activeRepresentationTab = useAppStore((state) => state.activeRepresentationTab);
  const fetchArtifacts = useAppStore((state) => state.fetchArtifacts);
  const selectArtifact = useAppStore((state) => state.selectArtifact);
  const setRepresentationTab = useAppStore((state) => state.setRepresentationTab);

  const artifacts = currentWorkspaceId ? (artifactsByWorkspace[currentWorkspaceId] ?? []) : [];
  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? null;

  // Fetch artifacts when workspace changes
  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchArtifacts(currentWorkspaceId);
    }
  }, [currentWorkspaceId, fetchArtifacts]);

  // Auto-select first artifact when list loads and nothing is selected
  useEffect(() => {
    if (artifacts.length > 0 && !selectedArtifactId) {
      selectArtifact(artifacts[0]!.id);
    }
  }, [artifacts, selectedArtifactId, selectArtifact]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left panel — artifact list */}
      <div
        style={{
          width: '280px',
          flexShrink: 0,
          borderRight: '0.5px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* List header */}
        <div
          style={{
            padding: '14px 12px 10px',
            borderBottom: '0.5px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Artifacts
          </span>
          {artifacts.length > 0 && (
            <span
              style={{
                marginLeft: '6px',
                fontSize: '10px',
                color: 'var(--t2)',
                background: 'var(--bg3)',
                borderRadius: '8px',
                padding: '1px 6px',
              }}
            >
              {artifacts.length}
            </span>
          )}
        </div>

        {/* List body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {artifacts.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--t2)', padding: '16px 12px', margin: 0 }}>
              No artifacts yet. Run a skill to generate artifacts.
            </p>
          ) : (
            artifacts.map((artifact) => (
              <ArtifactListItem
                key={artifact.id}
                artifact={artifact}
                isSelected={artifact.id === selectedArtifactId}
                onSelect={() => selectArtifact(artifact.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — artifact detail */}
      {selectedArtifact ? (
        <ArtifactDetailPane
          artifact={selectedArtifact}
          activeTab={activeRepresentationTab}
          onTabChange={setRepresentationTab}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--t2)',
            fontSize: '13px',
          }}
        >
          Select an artifact to view its details
        </div>
      )}
    </div>
  );
}
