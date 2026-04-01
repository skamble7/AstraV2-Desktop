import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';

const ListSessionsSchema = z.object({ workspace_id: z.string().min(1) });
const CreateSessionSchema = z.object({
  workspace_id: z.string().min(1),
  title: z.string().optional(),
});

export function registerSessionIpcHandlers(sessionServiceBaseUrl: string): void {
  const baseUrl = sessionServiceBaseUrl.replace(/\/$/, '');

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_event, rawPayload: unknown) => {
    const { workspace_id } = ListSessionsSchema.parse(rawPayload);
    const response = await fetch(
      `${baseUrl}/sessions?workspace_id=${encodeURIComponent(workspace_id)}`
    );
    if (!response.ok) throw new Error(`session:list failed: ${response.status}`);
    return response.json();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (_event, rawPayload: unknown) => {
    const payload = CreateSessionSchema.parse(rawPayload);
    const response = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`session:create failed: ${response.status}`);
    return response.json();
  });
}
