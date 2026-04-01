import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type {
  PlaybookRunResponse,
  CreateRunRequest,
} from '../../types/service.types.js';

export class LearningClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  async createRun(request: CreateRunRequest, signal?: AbortSignal): Promise<PlaybookRunResponse> {
    return this.post<PlaybookRunResponse>('/runs', request, signal);
  }

  async getRun(runId: string, signal?: AbortSignal): Promise<PlaybookRunResponse> {
    return this.get<PlaybookRunResponse>(`/runs/${encodeURIComponent(runId)}`, signal);
  }

  async updateRunStatus(
    runId: string,
    status: PlaybookRunResponse['status'],
    signal?: AbortSignal
  ): Promise<PlaybookRunResponse> {
    return this.patch<PlaybookRunResponse>(
      `/runs/${encodeURIComponent(runId)}`,
      { status },
      signal
    );
  }

  async updateStepStatus(
    runId: string,
    stepId: string,
    status: 'running' | 'completed' | 'failed' | 'cancelled',
    error?: string,
    signal?: AbortSignal
  ): Promise<void> {
    await this.patch(
      `/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}`,
      { status, error },
      signal
    );
  }
}
