import type { StateCreator } from 'zustand';

export type Screen = 'home' | 'workspace-list' | 'workspace' | 'artifact-detail';

interface HistoryEntry {
  screen: Screen;
  workspaceId: string | null;
}

export interface NavigationSlice {
  currentScreen: Screen;
  currentWorkspaceId: string | null;
  historyStack: HistoryEntry[];
  historyIndex: number;
  navigateTo: (screen: Screen, workspaceId?: string) => void;
  navigateHome: () => void;
  goBack: () => void;
  goForward: () => void;
}

export const createNavigationSlice: StateCreator<NavigationSlice> = (set, get) => ({
  currentScreen: 'home',
  currentWorkspaceId: null,
  historyStack: [{ screen: 'home', workspaceId: null }],
  historyIndex: 0,

  navigateTo: (screen, workspaceId) => {
    const { historyStack, historyIndex } = get();
    const entry: HistoryEntry = { screen, workspaceId: workspaceId ?? null };
    const newStack = [...historyStack.slice(0, historyIndex + 1), entry];
    set({
      currentScreen: screen,
      currentWorkspaceId: workspaceId ?? null,
      historyStack: newStack,
      historyIndex: newStack.length - 1,
    });
  },

  navigateHome: () => {
    const { historyStack, historyIndex } = get();
    const entry: HistoryEntry = { screen: 'home', workspaceId: null };
    const newStack = [...historyStack.slice(0, historyIndex + 1), entry];
    set({
      currentScreen: 'home',
      currentWorkspaceId: null,
      historyStack: newStack,
      historyIndex: newStack.length - 1,
    });
  },

  goBack: () => {
    const { historyStack, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const entry = historyStack[newIndex]!;
    set({
      currentScreen: entry.screen,
      currentWorkspaceId: entry.workspaceId,
      historyIndex: newIndex,
    });
  },

  goForward: () => {
    const { historyStack, historyIndex } = get();
    if (historyIndex >= historyStack.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = historyStack[newIndex]!;
    set({
      currentScreen: entry.screen,
      currentWorkspaceId: entry.workspaceId,
      historyIndex: newIndex,
    });
  },
});
