import type { StateCreator } from 'zustand';
import type { ElectronAPI, ArtifactData } from '../../ipc/ElectronApi.js';

export type RepresentationTab = 'narrative' | 'diagram' | 'data' | 'files';
export type RightPanelTab = 'artifacts' | 'context';

export interface ArtifactSlice {
  artifactsByWorkspace: Record<string, ArtifactData[]>;
  selectedArtifactId: string | null;
  activeRepresentationTab: RepresentationTab;
  rightPanelTab: RightPanelTab;

  fetchArtifacts: (workspaceId: string) => Promise<void>;
  selectArtifact: (artifactId: string | null) => void;
  setRepresentationTab: (tab: RepresentationTab) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
}

export const createArtifactSlice: StateCreator<ArtifactSlice> = (set) => ({
  artifactsByWorkspace: {},
  selectedArtifactId: null,
  activeRepresentationTab: 'narrative',
  rightPanelTab: 'artifacts',

  fetchArtifacts: async (workspaceId) => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const artifacts = await api.listArtifacts(workspaceId);
    set((state) => ({
      artifactsByWorkspace: { ...state.artifactsByWorkspace, [workspaceId]: artifacts },
    }));
  },

  selectArtifact: (artifactId) => set({ selectedArtifactId: artifactId }),

  setRepresentationTab: (tab) => set({ activeRepresentationTab: tab }),

  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
});
