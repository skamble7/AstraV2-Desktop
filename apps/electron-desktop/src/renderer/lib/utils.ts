import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ArtifactData } from '../ipc/ElectronApi.js';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) return date.toLocaleDateString();
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return 'Just now';
}

export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Returns a deterministic accent color for a workspace based on its name.
 * Uses a simple hash to pick from the accent palette.
 */
export function getWorkspaceColor(name: string): string {
  const colors = ['#4a9eff', '#9d7fe0', '#3dcb7a', '#e6a630', '#e05252', '#2ecfa8'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length] ?? '#4a9eff';
}

// ---------------------------------------------------------------------------
// Artifact file-type helpers
// ---------------------------------------------------------------------------

export type ArtifactIconType = 'code' | 'document' | 'diagram';

export interface ArtifactFileInfo {
  iconType: ArtifactIconType;
  typeLabel: string;
}

/**
 * Derives a display icon type and type label from an artifact's kind and
 * available representations. Handles both cam.* Astra artifacts and future
 * non-Astra artifacts identified by file-extension-style kind strings.
 */
export function getArtifactFileInfo(artifact: ArtifactData): ArtifactFileInfo {
  const { kind, data, diagram, narrative } = artifact;

  // Explicit file-extension kinds (future non-cam artifacts)
  if (kind.endsWith('.html')) return { iconType: 'code', typeLabel: 'Code · HTML' };
  if (kind.endsWith('.md'))   return { iconType: 'document', typeLabel: 'Document · MD' };
  if (kind.endsWith('.docx')) return { iconType: 'document', typeLabel: 'Document · DOCX' };

  // cam.* domain artifacts — inspect which representations are present
  if (kind.startsWith('cam.')) {
    if (diagram && !data && !narrative) return { iconType: 'diagram', typeLabel: 'Diagram · Mermaid' };
    if (narrative && !data && !diagram) return { iconType: 'document', typeLabel: 'Document · MD' };
    if (data !== undefined && data !== null) return { iconType: 'code', typeLabel: 'Artifact · JSON' };
  }

  // Fallback: inspect representations for non-cam kinds
  if (diagram && !data && !narrative) return { iconType: 'diagram', typeLabel: 'Diagram · Mermaid' };
  if (narrative && !data && !diagram) return { iconType: 'document', typeLabel: 'Document · MD' };
  return { iconType: 'document', typeLabel: 'Document' };
}
