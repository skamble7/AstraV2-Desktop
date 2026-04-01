/**
 * WorkspaceServiceClient — HTTP client for workspace-service (:8010).
 * Runs exclusively in the Electron main process.
 *
 * Normalizes API responses to the WorkspaceResponse shape, handling common
 * Python backend field-name variants (workspace_id / _id / id, state / status, etc.)
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
    const raw = await response.json() as unknown[];
    return raw.map((w) => this.normalize(w as Record<string, unknown>));
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<WorkspaceResponse> {
    const response = await fetch(`${this.baseUrl}/workspace/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Failed to create workspace: ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    return this.normalize(raw);
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
    const response = await fetch(`${this.baseUrl}/workspace/${encodeURIComponent(workspaceId)}`);
    if (!response.ok) throw new Error(`Failed to get workspace: ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    return this.normalize(raw);
  }

  /**
   * Maps a raw API response to WorkspaceResponse, handling common field-name variants:
   *   id field:     id | workspace_id | _id
   *   status field: status | state
   *   type field:   domain_type | workspace_type | type
   */
  private normalize(raw: Record<string, unknown>): WorkspaceResponse {
    const id = String(raw['id'] ?? raw['workspace_id'] ?? raw['_id'] ?? '');
    const status = String(raw['status'] ?? raw['state'] ?? 'active');
    const domainType = String(raw['domain_type'] ?? raw['workspace_type'] ?? raw['type'] ?? '');

    return {
      id,
      name: String(raw['name'] ?? ''),
      domain_type: domainType,
      ...(raw['description'] !== undefined ? { description: String(raw['description']) } : {}),
      status,
      artifact_count: Number(raw['artifact_count'] ?? 0),
      run_count: Number(raw['run_count'] ?? 0),
      conversation_count: Number(raw['conversation_count'] ?? 0),
      created_at: String(raw['created_at'] ?? ''),
      updated_at: String(raw['updated_at'] ?? ''),
    };
  }
}
