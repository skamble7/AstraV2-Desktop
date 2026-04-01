/**
 * WorkspaceServiceClient — HTTP client for workspace-service (:8010).
 * Runs exclusively in the Electron main process.
 */

import type { WorkspaceResponse, CreateWorkspaceRequest } from 'astra-agent';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8010';

export class WorkspaceServiceClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async listWorkspaces(): Promise<WorkspaceResponse[]> {
    const response = await fetch(`${this.baseUrl}/workspace/`);
    if (!response.ok) throw new Error(`Failed to list workspaces: ${response.status}`);
    return response.json() as Promise<WorkspaceResponse[]>;
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<WorkspaceResponse> {
    const response = await fetch(`${this.baseUrl}/workspace/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Failed to create workspace: ${response.status}`);
    return response.json() as Promise<WorkspaceResponse>;
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
    const response = await fetch(`${this.baseUrl}/workspace/${encodeURIComponent(workspaceId)}`);
    if (!response.ok) throw new Error(`Failed to get workspace: ${response.status}`);
    return response.json() as Promise<WorkspaceResponse>;
  }
}
