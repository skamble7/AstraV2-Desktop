import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';

export function registerSkillPackIpcHandlers(skillRegistryBaseUrl: string): void {
  const baseUrl = skillRegistryBaseUrl.replace(/\/$/, '');

  ipcMain.handle(IPC_CHANNELS.SKILL_PACK_LIST, async () => {
    const response = await fetch(`${baseUrl}/skill-pack?status=published`);
    if (!response.ok) throw new Error(`skill-pack:list failed: ${response.status}`);
    return response.json();
  });
}
