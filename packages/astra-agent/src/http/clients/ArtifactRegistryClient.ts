import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type { ArtifactKindResponse } from '../../types/service.types.js';

export class ArtifactRegistryClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  /**
   * Fetches the kind definition including JSON schema from the artifact registry.
   * Returns null if the kind is not found (404) so callers can proceed without schema.
   */
  async getKind(kindId: string, signal?: AbortSignal): Promise<ArtifactKindResponse | null> {
    try {
      return await this.get<ArtifactKindResponse>(
        `/registry/kinds/${encodeURIComponent(kindId)}`,
        signal
      );
    } catch {
      return null;
    }
  }
}
