import type { StateCreator } from 'zustand';
import type { ElectronAPI, WorkspaceData } from '../../ipc/ElectronApi.js';

export interface WorkspaceSlice {
  workspaces: WorkspaceData[];
  activeWorkspace: WorkspaceData | null;
  workspacesLoading: boolean;
  workspacesError: string | null;

  fetchWorkspaces: () => Promise<void>;
  fetchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string, domainType: string, description?: string) => Promise<WorkspaceData>;
}

export const createWorkspaceSlice: StateCreator<WorkspaceSlice> = (set) => ({
  workspaces: [],
  activeWorkspace: null,
  workspacesLoading: false,
  workspacesError: null,

  fetchWorkspaces: async () => {
    set({ workspacesLoading: true, workspacesError: null });
    try {
      const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
      const workspaces = await api.listWorkspaces();
      set({ workspaces, workspacesLoading: false });
    } catch (error) {
      set({
        workspacesError: error instanceof Error ? error.message : 'Failed to load workspaces',
        workspacesLoading: false,
      });
    }
  },

  fetchWorkspace: async (workspaceId) => {
    try {
      const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
      const workspace = await api.getWorkspace(workspaceId);
      set({ activeWorkspace: workspace });
    } catch (error) {
      set({
        workspacesError: error instanceof Error ? error.message : 'Failed to load workspace',
      });
    }
  },

  createWorkspace: async (name, domainType, description) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const workspace = await api.createWorkspace(name, domainType, description);
    set((state) => ({ workspaces: [...state.workspaces, workspace] }));
    return workspace;
  },
});
