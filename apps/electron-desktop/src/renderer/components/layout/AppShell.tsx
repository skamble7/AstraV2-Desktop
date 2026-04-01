/**
 * AppShell — wraps all screens.
 * Provides the full-height layout container and the global error boundary.
 * Theme is applied via CSS class on body in themeSlice.toggleTheme().
 */

import React from 'react';
import { ErrorBoundary } from '../shared/ErrorBoundary.js';
import { TopBar } from './TopBar.js';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): React.ReactElement {
  return (
    <ErrorBoundary>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          background: 'var(--bg0)',
          color: 'var(--t0)',
          overflow: 'hidden',
        }}
      >
        <TopBar />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    </ErrorBoundary>
  );
}
