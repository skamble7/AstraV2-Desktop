import type { StateCreator } from 'zustand';

export type Screen = 'home' | 'workspace-list' | 'workspace' | 'artifact-detail';

export interface NavigationSlice {
  currentScreen: Screen;
  currentWorkspaceId: string | null;
  navigateTo: (screen: Screen, workspaceId?: string) => void;
  navigateHome: () => void;
}

export const createNavigationSlice: StateCreator<NavigationSlice> = (set) => ({
  currentScreen: 'home',
  currentWorkspaceId: null,

  navigateTo: (screen, workspaceId) =>
    set({
      currentScreen: screen,
      currentWorkspaceId: workspaceId ?? null,
    }),

  navigateHome: () =>
    set({
      currentScreen: 'home',
      currentWorkspaceId: null,
    }),
});
