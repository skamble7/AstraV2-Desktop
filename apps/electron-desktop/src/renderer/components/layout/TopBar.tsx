/**
 * TopBar — 49px global header.
 *
 * Left: macOS traffic-light spacer → Back / Forward / Home nav buttons → ASTRA logo
 * Center: context-sensitive breadcrumb
 * Right: Theme toggle
 *
 * The 76px left padding clears macOS traffic-light buttons (hiddenInset titlebar).
 */

import React from 'react';
import { useAppStore } from '../../store/index.js';

// ─── Nav Button ───────────────────────────────────────────────────────────────

function NavBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--t3)' : 'var(--t1)',
        padding: '5px 6px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s',
        opacity: disabled ? 0.35 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      {children}
    </button>
  );
}

// ─── Navigation Controls ──────────────────────────────────────────────────────

function NavigationControls(): React.ReactElement {
  const historyIndex = useAppStore((state) => state.historyIndex);
  const historyStack = useAppStore((state) => state.historyStack);
  const currentScreen = useAppStore((state) => state.currentScreen);
  const goBack = useAppStore((state) => state.goBack);
  const goForward = useAppStore((state) => state.goForward);
  const navigateHome = useAppStore((state) => state.navigateHome);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyStack.length - 1;
  const isHome = currentScreen === 'home';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      {/* Back */}
      <NavBtn onClick={goBack} disabled={!canGoBack} title="Go back">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 2 4 7 9 12" />
        </svg>
      </NavBtn>

      {/* Forward */}
      <NavBtn onClick={goForward} disabled={!canGoForward} title="Go forward">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5 2 10 7 5 12" />
        </svg>
      </NavBtn>

      {/* Home */}
      <NavBtn onClick={navigateHome} disabled={isHome} title="Go home">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 6.5 L7 1 L13 6.5" />
          <path d="M2.5 5.5 L2.5 13 L5.5 13 L5.5 9.5 L8.5 9.5 L8.5 13 L11.5 13 L11.5 5.5" />
        </svg>
      </NavBtn>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 4px' }} />
    </div>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function AstraLogo(): React.ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb(): React.ReactElement {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const navigateTo = useAppStore((state) => state.navigateTo);
  const navigateHome = useAppStore((state) => state.navigateHome);

  const crumb: React.CSSProperties = { color: 'var(--t2)', fontSize: '13px', cursor: 'pointer' };
  const activeCrumb: React.CSSProperties = { color: 'var(--t1)', fontSize: '13px' };
  const sep: React.CSSProperties = { color: 'var(--t2)', fontSize: '13px', padding: '0 4px' };

  if (currentScreen === 'home') return <></>;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={crumb} onClick={navigateHome} role="button" tabIndex={0}>
        Home
      </span>

      {currentScreen === 'workspace-list' && (
        <>
          <span style={sep}>›</span>
          <span style={activeCrumb}>Workspaces</span>
        </>
      )}

      {(currentScreen === 'workspace' || currentScreen === 'artifact-detail') && (
        <>
          <span style={sep}>›</span>
          <span style={crumb} onClick={() => navigateTo('workspace-list')} role="button" tabIndex={0}>
            Workspaces
          </span>
          {activeWorkspace && (
            <>
              <span style={sep}>›</span>
              <span
                style={currentScreen === 'workspace' ? activeCrumb : crumb}
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
              <span style={sep}>›</span>
              <span style={activeCrumb}>Artifacts</span>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

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

// ─── TopBar ───────────────────────────────────────────────────────────────────

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
        background: 'var(--bg1)',
        borderBottom: '0.5px solid var(--border)',
        WebkitAppRegion: 'drag',
        // Extra right padding for symmetry
        paddingRight: '12px',
      } as React.CSSProperties}
    >
      {/* Left: traffic-light spacer + nav buttons + logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          // 76px clears macOS hiddenInset traffic lights
          paddingLeft: '76px',
          gap: '4px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <NavigationControls />
        <div
          style={{ cursor: 'pointer' }}
          onClick={navigateHome}
          role="button"
          tabIndex={0}
        >
          <AstraLogo />
        </div>
      </div>

      {/* Center: Breadcrumb */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
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
