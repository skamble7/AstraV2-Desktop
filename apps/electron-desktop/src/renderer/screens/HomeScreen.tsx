/**
 * HomeScreen — the landing dashboard.
 *
 * Layout:
 * - Greeting header with time-based message
 * - 2×2 grid of action cards (Workspaces, Skill Registry [placeholder], Artifact Kinds [placeholder], Docs)
 * - Two-column lower section: Recent Workspaces | Recent Activity feed
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../store/index.js';
import { getTimeGreeting, getInitials, getWorkspaceColor, formatRelativeTime } from '../lib/utils.js';

function GreetingHeader(): React.ReactElement {
  const workspaces = useAppStore((state) => state.workspaces);
  const greeting = getTimeGreeting();

  return (
    <div style={{ marginBottom: '28px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--t0)', marginBottom: '4px' }}>
        {greeting}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--t1)' }}>
        {workspaces.length > 0
          ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''} · Ready to explore`
          : 'Welcome to Astra Desktop'}
      </p>
    </div>
  );
}

interface ActionCardProps {
  title: string;
  subtitle: string;
  accentColor: string;
  stat1: string;
  stat2: string;
  onClick: () => void;
}

function ActionCard({ title, subtitle, accentColor, stat1, stat2, onClick }: ActionCardProps): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
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
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--t0)' }}>{title}</span>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: accentColor,
          }}
        />
      </div>
      <p style={{ fontSize: '12px', color: 'var(--t2)' }}>{subtitle}</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <span style={{ fontSize: '11px', color: accentColor }}>{stat1}</span>
        <span style={{ fontSize: '11px', color: 'var(--t2)' }}>·</span>
        <span style={{ fontSize: '11px', color: 'var(--t2)' }}>{stat2}</span>
      </div>
    </button>
  );
}

function ActionCards(): React.ReactElement {
  const workspaces = useAppStore((state) => state.workspaces);
  const navigateTo = useAppStore((state) => state.navigateTo);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginBottom: '28px',
      }}
    >
      <ActionCard
        title="Workspaces"
        subtitle="Your knowledge workspaces"
        accentColor="var(--accent-blue)"
        stat1={`${workspaces.length} workspaces`}
        stat2="View all"
        onClick={() => navigateTo('workspace-list')}
      />
      <ActionCard
        title="Skill Packs"
        subtitle="Pre-built analysis playbooks"
        accentColor="var(--accent-purple)"
        stat1="Available packs"
        stat2="Browse"
        onClick={() => navigateTo('workspace-list')}
      />
      <ActionCard
        title="Artifact Kinds"
        subtitle="Knowledge artifact templates"
        accentColor="var(--accent-green)"
        stat1="Registered kinds"
        stat2="Explore"
        onClick={() => {}}
      />
      <ActionCard
        title="Docs & Guides"
        subtitle="Learn how to use Astra"
        accentColor="var(--accent-amber)"
        stat1="Guides"
        stat2="Get started"
        onClick={() => {}}
      />
    </div>
  );
}

function RecentWorkspaces(): React.ReactElement {
  const workspaces = useAppStore((state) => state.workspaces);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const fetchWorkspace = useAppStore((state) => state.fetchWorkspace);

  const recent = workspaces.slice(0, 5);

  const handleOpenWorkspace = async (workspaceId: string): Promise<void> => {
    await fetchWorkspace(workspaceId);
    navigateTo('workspace', workspaceId);
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Recent Workspaces
        </h2>
        <button
          onClick={() => navigateTo('workspace-list')}
          style={{ background: 'none', border: 'none', fontSize: '12px', color: 'var(--accent-blue)', cursor: 'pointer' }}
        >
          View all →
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {recent.length === 0 && (
          <p style={{ color: 'var(--t2)', fontSize: '13px' }}>No workspaces yet</p>
        )}
        {recent.map((ws) => (
          <button
            key={ws.id}
            onClick={() => void handleOpenWorkspace(ws.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              background: 'none',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: getWorkspaceColor(ws.name),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {getInitials(ws.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ws.name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--t2)' }}>
                {ws.domain_type} · {formatRelativeTime(ws.updated_at)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed(): React.ReactElement {
  return (
    <div style={{ flex: 1 }}>
      <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
        Recent Activity
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--t2)' }}>No recent activity</p>
    </div>
  );
}

export function HomeScreen(): React.ReactElement {
  const fetchWorkspaces = useAppStore((state) => state.fetchWorkspaces);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '32px 40px',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <GreetingHeader />
      <ActionCards />

      <div style={{ display: 'flex', gap: '32px' }}>
        <RecentWorkspaces />
        <ActivityFeed />
      </div>
    </div>
  );
}
