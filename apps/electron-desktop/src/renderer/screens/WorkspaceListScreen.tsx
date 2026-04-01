/**
 * WorkspaceListScreen — lists all workspaces in a 3-column grid.
 *
 * Features:
 * - Client-side search by name/domain
 * - "New Workspace" modal
 * - Click workspace → navigate to WorkspaceShell
 */

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { getInitials, getWorkspaceColor, formatRelativeTime } from '../lib/utils.js';
import type { WorkspaceData } from '../ipc/ElectronApi.js';

function NewWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspace: WorkspaceData) => void;
}): React.ReactElement {
  const createWorkspace = useAppStore((state) => state.createWorkspace);
  const [name, setName] = useState('');
  const [domainType, setDomainType] = useState('general');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const workspace = await createWorkspace(name.trim(), domainType, description.trim() || undefined);
      onCreated(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          background: 'var(--bg1)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-card)',
          padding: '24px',
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t0)' }}>New Workspace</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'var(--t1)' }}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workspace"
            required
            style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '8px 10px',
              color: 'var(--t0)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'var(--t1)' }}>Domain Type</label>
          <select
            value={domainType}
            onChange={(e) => setDomainType(e.target.value)}
            style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '8px 10px',
              color: 'var(--t0)',
              fontSize: '13px',
              outline: 'none',
            }}
          >
            <option value="general">General</option>
            <option value="architecture">Architecture</option>
            <option value="legacy">Legacy Systems</option>
            <option value="data">Data & Analytics</option>
            <option value="security">Security</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'var(--t1)' }}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you explore in this workspace?"
            rows={2}
            style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '8px 10px',
              color: 'var(--t0)',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error && <p style={{ color: 'var(--accent-red)', fontSize: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'var(--bg3)',
              border: '0.5px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--t1)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            style={{
              padding: '8px 14px',
              background: isCreating ? 'var(--bg4)' : 'var(--accent-blue)',
              border: 'none',
              borderRadius: '8px',
              color: isCreating ? 'var(--t2)' : '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isCreating ? 'not-allowed' : 'pointer',
            }}
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceData }): React.ReactElement {
  const navigateTo = useAppStore((state) => state.navigateTo);
  const fetchWorkspace = useAppStore((state) => state.fetchWorkspace);
  const [hovered, setHovered] = useState(false);

  const color = getWorkspaceColor(workspace.name);

  const handleOpen = async (): Promise<void> => {
    await fetchWorkspace(workspace.id);
    navigateTo('workspace', workspace.id);
  };

  const statusColor = workspace.status === 'active' ? 'var(--accent-green)'
    : workspace.status === 'running' ? 'var(--accent-amber)'
    : 'var(--t2)';

  return (
    <button
      onClick={() => void handleOpen()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg3)' : 'var(--bg2)',
        border: `0.5px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '16px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {getInitials(workspace.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workspace.name}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--t2)' }}>{workspace.domain_type}</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { label: 'Artifacts', value: workspace.artifact_count },
          { label: 'Runs', value: workspace.run_count },
          { label: 'Sessions', value: workspace.conversation_count },
        ].map((stat) => (
          <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t0)' }}>{stat.value}</span>
            <span style={{ fontSize: '10px', color: 'var(--t2)' }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />
        <span style={{ fontSize: '11px', color: 'var(--t2)' }}>
          {workspace.status} · {formatRelativeTime(workspace.updated_at)}
        </span>
      </div>
    </button>
  );
}

export function WorkspaceListScreen(): React.ReactElement {
  const workspaces = useAppStore((state) => state.workspaces);
  const fetchWorkspaces = useAppStore((state) => state.fetchWorkspaces);
  const workspacesLoading = useAppStore((state) => state.workspacesLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const filtered = workspaces.filter(
    (ws) =>
      ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ws.domain_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t0)' }}>Your workspaces</h1>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 7px',
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--t1)',
            }}
          >
            {workspaces.length}
          </span>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          style={{
            padding: '8px 14px',
            background: 'var(--accent-blue)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New workspace
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workspaces…"
          style={{
            width: '280px',
            background: 'var(--bg2)',
            border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            padding: '7px 10px',
            color: 'var(--t0)',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      </div>

      {/* Grid */}
      {workspacesLoading ? (
        <p style={{ color: 'var(--t2)', fontSize: '13px' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--t2)', fontSize: '13px' }}>
          {searchQuery ? 'No workspaces match your search' : 'No workspaces yet — create one to get started'}
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
          }}
        >
          {filtered.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewWorkspaceModal
          onClose={() => setShowNewModal(false)}
          onCreated={(workspace) => {
            setShowNewModal(false);
            const navigateTo = useAppStore.getState().navigateTo;
            navigateTo('workspace', workspace.id);
          }}
        />
      )}
    </div>
  );
}
