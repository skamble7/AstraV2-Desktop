import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import type { WorkspaceServiceClient } from '../services/WorkspaceServiceClient.js';

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1),
  domain_type: z.string().min(1),
  description: z.string().optional(),
});

const GetWorkspaceSchema = z.object({
  workspace_id: z.string().min(1),
});

export function registerWorkspaceIpcHandlers(client: WorkspaceServiceClient): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
    return client.listWorkspaces();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CREATE, async (_event, rawPayload: unknown) => {
    const payload = CreateWorkspaceSchema.parse(rawPayload);
    return client.createWorkspace(payload);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, async (_event, rawPayload: unknown) => {
    const payload = GetWorkspaceSchema.parse(rawPayload);
    return client.getWorkspace(payload.workspace_id);
  });
}
