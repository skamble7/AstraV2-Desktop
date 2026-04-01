/**
 * Zustand store — combines all slices into a single typed store.
 *
 * Uses the Zustand slice pattern: each slice is a StateCreator that manages
 * a cohesive domain. All slices are merged into one store object.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createNavigationSlice, type NavigationSlice } from './slices/navigationSlice.js';
import { createThemeSlice, type ThemeSlice } from './slices/themeSlice.js';
import { createWorkspaceSlice, type WorkspaceSlice } from './slices/workspaceSlice.js';
import { createConversationSlice, type ConversationSlice } from './slices/conversationSlice.js';
import { createAgentSlice, type AgentSlice } from './slices/agentSlice.js';
import { createArtifactSlice, type ArtifactSlice } from './slices/artifactSlice.js';
import { createSkillPackSlice, type SkillPackSlice } from './slices/skillPackSlice.js';

export type AppStore =
  & NavigationSlice
  & ThemeSlice
  & WorkspaceSlice
  & ConversationSlice
  & AgentSlice
  & ArtifactSlice
  & SkillPackSlice;

export const useAppStore = create<AppStore>()(
  devtools(
    (...args) => ({
      ...createNavigationSlice(...args),
      ...createThemeSlice(...args),
      ...createWorkspaceSlice(...args),
      ...createConversationSlice(...args),
      ...createAgentSlice(...args),
      ...createArtifactSlice(...args),
      ...createSkillPackSlice(...args),
    }),
    { name: 'AstraStore' }
  )
);

// Convenience selector hooks
export { useAppStore as useStore };
