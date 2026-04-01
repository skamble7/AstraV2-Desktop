/**
 * App — top-level component.
 *
 * Responsibilities:
 * 1. Sets up the agent stream hook (single IPC→store wiring point)
 * 2. Renders the correct screen based on navigation state
 * 3. Wraps everything in AppShell (theme, error boundary)
 */

import React from 'react';
import { useAppStore } from './store/index.js';
import { useAgentStream } from './hooks/useAgentStream.js';
import { AppShell } from './components/layout/AppShell.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { WorkspaceListScreen } from './screens/WorkspaceListScreen.js';
import { WorkspaceShellScreen } from './screens/WorkspaceShellScreen.js';
import { ArtifactDetailScreen } from './screens/ArtifactDetailScreen.js';

export function App(): React.ReactElement {
  useAgentStream();

  const currentScreen = useAppStore((state) => state.currentScreen);

  return (
    <AppShell>
      {currentScreen === 'home' && <HomeScreen />}
      {currentScreen === 'workspace-list' && <WorkspaceListScreen />}
      {currentScreen === 'workspace' && <WorkspaceShellScreen />}
      {currentScreen === 'artifact-detail' && <ArtifactDetailScreen />}
    </AppShell>
  );
}
