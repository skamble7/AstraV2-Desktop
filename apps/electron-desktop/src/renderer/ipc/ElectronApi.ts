/**
 * Re-export of ElectronAPI types for use in the renderer.
 * The actual interface lives in src/preload/ElectronApi.ts.
 * This file provides renderer-side access with proper type declarations.
 */

export type {
  ElectronAPI,
  WorkspaceData,
  ArtifactData,
  SessionData,
  SkillPackData,
} from '../../preload/ElectronApi.js';

// Augment the window type globally for TypeScript
declare global {
  interface Window {
    electronAPI: import('../../preload/ElectronApi.js').ElectronAPI;
  }
}
