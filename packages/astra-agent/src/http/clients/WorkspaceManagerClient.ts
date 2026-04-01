import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type {
  ArtifactResponse,
  UpsertArtifactRequest,
} from '../../types/service.types.js';

export class WorkspaceManagerClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  async listArtifacts(workspaceId: string, signal?: AbortSignal): Promise<ArtifactResponse[]> {
    return this.get<ArtifactResponse[]>(
      `/artifact/${encodeURIComponent(workspaceId)}/parent`,
      signal
    );
  }

  async getArtifact(
    workspaceId: string,
    artifactId: string,
    signal?: AbortSignal
  ): Promise<ArtifactResponse> {
    return this.get<ArtifactResponse>(
      `/artifact/${encodeURIComponent(workspaceId)}/${encodeURIComponent(artifactId)}`,
      signal
    );
  }

  async upsertArtifact(
    workspaceId: string,
    request: UpsertArtifactRequest,
    signal?: AbortSignal
  ): Promise<ArtifactResponse> {
    return this.post<ArtifactResponse>(
      `/artifact/${encodeURIComponent(workspaceId)}`,
      request,
      signal
    );
  }

  async batchUpsertArtifacts(
    workspaceId: string,
    requests: UpsertArtifactRequest[],
    signal?: AbortSignal
  ): Promise<ArtifactResponse[]> {
    return this.post<ArtifactResponse[]>(
      `/artifact/${encodeURIComponent(workspaceId)}/batch`,
      { artifacts: requests },
      signal
    );
  }
}
