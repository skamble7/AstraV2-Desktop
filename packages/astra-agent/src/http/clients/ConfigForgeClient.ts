import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type { LlmConfigResponse } from '../../types/service.types.js';

export class ConfigForgeClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  async getLlmConfig(configRef: string, signal?: AbortSignal): Promise<LlmConfigResponse> {
    return this.get<LlmConfigResponse>(`/config/resolve/${encodeURIComponent(configRef)}`, signal);
  }
}
