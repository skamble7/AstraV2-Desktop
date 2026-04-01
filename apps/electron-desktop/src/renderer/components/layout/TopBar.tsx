/**
 * TopBar — 49px global header.
 *
 * Left: ASTRA logo + "v2" badge (click → Home)
 * Center: Context-sensitive breadcrumb
 * Right: Theme toggle + Settings gear
 */

import React from 'react';
import { useAppStore } from '../../store/index.js';

function AstraLogo(): React.ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {/* Simple SVG logomark */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="var(--accent-blue)" strokeWidth="1.5" />
        <path d="M5 10 L10 5 L15 10 L10 15 Z" stroke="var(--accent-blue)" strokeWidth="1.5" fill="none" />
        <circle cx="10" cy="10" r="2" fill="var(--accent-blue)" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em', color: 'var(--t0)' }}>
        ASTRA
      </span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--accent-blue)',
          background: 'rgba(74, 158, 255, 0.15)',
          padding: '1px 5px',
          borderRadius: '4px',
          letterSpacing: '0.02em',
        }}
      >
        v2
      </span>
    </span>
  );
}

function Breadcrumb(): React.ReactElement {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const navigateHome = useAppStore((state) => state.navigateHome);

  const crumbStyle: React.CSSProperties = {
    color: 'var(--t2)',
    fontSize: '13px',
    cursor: 'pointer',
  };

  const activeCrumbStyle: React.CSSProperties = {
    color: 'var(--t1)',
    fontSize: '13px',
  };

  const separatorStyle: React.CSSProperties = {
    color: 'var(--t2)',
    fontSize: '13px',
    padding: '0 4px',
  };

  if (currentScreen === 'home') return <></>;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={crumbStyle} onClick={navigateHome} role="button" tabIndex={0}>
        Home
      </span>
      {currentScreen === 'workspace-list' && (
        <>
          <span style={separatorStyle}>›</span>
          <span style={activeCrumbStyle}>Workspaces</span>
        </>
      )}
      {(currentScreen === 'workspace' || currentScreen === 'artifact-detail') && (
        <>
          <span style={separatorStyle}>›</span>
          <span
            style={crumbStyle}
            onClick={() => navigateTo('workspace-list')}
            role="button"
            tabIndex={0}
          >
            Workspaces
          </span>
          {activeWorkspace && (
            <>
              <span style={separatorStyle}>›</span>
              <span
                style={currentScreen === 'workspace' ? activeCrumbStyle : crumbStyle}
                onClick={() => navigateTo('workspace', activeWorkspace.id)}
                role="button"
                tabIndex={0}
              >
                {activeWorkspace.name}
              </span>
            </>
          )}
          {currentScreen === 'artifact-detail' && (
            <>
              <span style={separatorStyle}>›</span>
              <span style={activeCrumbStyle}>Artifacts</span>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ThemeToggle(): React.ReactElement {
  const isLightTheme = useAppStore((state) => state.isLightTheme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      title={isLightTheme ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--t1)',
        padding: '6px',
        borderRadius: '7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {isLightTheme ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
        </svg>
      )}
    </button>
  );
}

export function TopBar(): React.ReactElement {
  const navigateHome = useAppStore((state) => state.navigateHome);

  return (
    <header
      style={{
        height: '49px',
        minHeight: '49px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'var(--bg1)',
        borderBottom: '0.5px solid var(--border)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Left: Logo */}
      <div
        style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={navigateHome}
        role="button"
        tabIndex={0}
      >
        <AstraLogo />
      </div>

      {/* Center: Breadcrumb */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Breadcrumb />
      </div>

      {/* Right: Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <ThemeToggle />
      </div>
    </header>
  );
}
