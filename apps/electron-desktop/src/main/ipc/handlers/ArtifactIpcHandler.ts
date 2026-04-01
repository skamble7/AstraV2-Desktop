import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';

const ListArtifactsSchema = z.object({
  workspace_id: z.string().min(1),
});

const GetArtifactSchema = z.object({
  workspace_id: z.string().min(1),
  artifact_id: z.string().min(1),
});

/** Normalizes a raw artifact record to use `id` consistently. */
function normalizeArtifact(raw: Record<string, unknown>): Record<string, unknown> {
  const id = String(raw['artifact_id'] ?? raw['id'] ?? raw['_id'] ?? '');
  return { ...raw, id };
}

/** Extracts an array from either a bare array or a wrapped `{ artifacts: [...] }` response. */
function extractArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['artifacts'])) {
    return (raw as Record<string, unknown>)['artifacts'] as Record<string, unknown>[];
  }
  return [];
}

export function registerArtifactIpcHandlers(workspaceManagerBaseUrl: string): void {
  const baseUrl = workspaceManagerBaseUrl.replace(/\/$/, '');

  ipcMain.handle(IPC_CHANNELS.ARTIFACT_LIST, async (_event, rawPayload: unknown) => {
    const { workspace_id } = ListArtifactsSchema.parse(rawPayload);
    const url = `${baseUrl}/artifact/${encodeURIComponent(workspace_id)}?include_deleted=false&limit=50&offset=0`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`artifact:list failed: ${response.status}`);
    const raw = await response.json() as unknown;
    return extractArray(raw).map(normalizeArtifact);
  });

  ipcMain.handle(IPC_CHANNELS.ARTIFACT_GET, async (_event, rawPayload: unknown) => {
    const { workspace_id, artifact_id } = GetArtifactSchema.parse(rawPayload);
    const response = await fetch(
      `${baseUrl}/artifact/${encodeURIComponent(workspace_id)}/${encodeURIComponent(artifact_id)}`
    );
    if (!response.ok) throw new Error(`artifact:get failed: ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    return normalizeArtifact(raw);
  });
}
