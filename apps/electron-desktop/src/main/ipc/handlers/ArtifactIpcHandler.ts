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

export function registerArtifactIpcHandlers(workspaceManagerBaseUrl: string): void {
  const baseUrl = workspaceManagerBaseUrl.replace(/\/$/, '');

  ipcMain.handle(IPC_CHANNELS.ARTIFACT_LIST, async (_event, rawPayload: unknown) => {
    const { workspace_id } = ListArtifactsSchema.parse(rawPayload);
    const response = await fetch(`${baseUrl}/artifact/${encodeURIComponent(workspace_id)}/parent`);
    if (!response.ok) throw new Error(`artifact:list failed: ${response.status}`);
    return response.json();
  });

  ipcMain.handle(IPC_CHANNELS.ARTIFACT_GET, async (_event, rawPayload: unknown) => {
    const { workspace_id, artifact_id } = GetArtifactSchema.parse(rawPayload);
    const response = await fetch(
      `${baseUrl}/artifact/${encodeURIComponent(workspace_id)}/${encodeURIComponent(artifact_id)}`
    );
    if (!response.ok) throw new Error(`artifact:get failed: ${response.status}`);
    return response.json();
  });
}
