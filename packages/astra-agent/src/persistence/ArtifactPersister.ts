/**
 * ArtifactPersister — batch-upserts enriched StagedArtifacts to workspace-manager-service.
 *
 * Called by StepRunner after all three phases (discover + diagram + narrative) complete.
 * A single batch call is made per step to minimise HTTP round trips.
 */

import type { WorkspaceManagerClient } from '../http/clients/WorkspaceManagerClient.js';
import type { StagedArtifact } from '../types/skill.types.js';
import type { ArtifactResponse } from '../types/service.types.js';

export class ArtifactPersister {
  private readonly workspaceManagerClient: WorkspaceManagerClient;

  constructor(workspaceManagerClient: WorkspaceManagerClient) {
    this.workspaceManagerClient = workspaceManagerClient;
  }

  /**
   * Persists all staged artifacts for a step in a single batch request.
   * Returns the persisted artifact responses (with assigned IDs).
   */
  async batchPersist(
    workspaceId: string,
    artifacts: StagedArtifact[],
    runId: string,
    signal?: AbortSignal
  ): Promise<ArtifactResponse[]> {
    if (artifacts.length === 0) {
      return [];
    }

    const requests = artifacts.map((artifact) => ({
      kind: artifact.kind,
      ...(artifact.name !== undefined ? { name: artifact.name } : {}),
      data: artifact.data,
      ...(artifact.diagram !== undefined ? { diagram: artifact.diagram } : {}),
      ...(artifact.narrative !== undefined ? { narrative: artifact.narrative } : {}),
      skill_name: artifact.skill_name,
      run_id: runId,
    }));

    console.log(`[ArtifactPersister] upsert-batch: ${requests.map((r) => `${r.kind} (name: ${r.name ?? 'none'})`).join(', ')}`);

    const result = await this.workspaceManagerClient.batchUpsertArtifacts(workspaceId, requests, signal);
    console.log(`[ArtifactPersister] upsert-batch OK: ${result.length} artifact(s) saved`);
    return result;
  }
}
