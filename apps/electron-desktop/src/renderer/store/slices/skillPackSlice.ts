import type { StateCreator } from 'zustand';
import type { ElectronAPI, SkillPackData } from '../../ipc/ElectronApi.js';

export interface SkillPackSlice {
  skillPacks: SkillPackData[];
  selectedPackId: string | null;

  fetchSkillPacks: () => Promise<void>;
  selectPack: (packId: string | null) => void;
}

export const createSkillPackSlice: StateCreator<SkillPackSlice> = (set) => ({
  skillPacks: [],
  selectedPackId: null,

  fetchSkillPacks: async () => {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const packs = await api.listSkillPacks();
    set({ skillPacks: packs });
  },

  selectPack: (packId) => set({ selectedPackId: packId }),
});
