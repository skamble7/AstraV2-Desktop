/**
 * RunRecorder — creates and updates PlaybookRun records in learning-service.
 *
 * Called throughout execution to track run and step lifecycle state.
 * The learning-service provides provenance: which skills ran, when, and with what outcome.
 */

import type { LearningClient } from '../http/clients/LearningClient.js';
import type { Plan } from '../types/plan.types.js';

export class RunRecorder {
  private readonly learningClient: LearningClient;
  private runId: string | null = null;

  constructor(learningClient: LearningClient) {
    this.learningClient = learningClient;
  }

  /**
   * Creates a new run record and returns the assigned run_id.
   * Call this before execution begins.
   */
  async createRun(plan: Plan, signal?: AbortSignal): Promise<string> {
    const skillIds = plan.steps.map((step) => step.skill_id);
    const run = await this.learningClient.createRun(
      {
        workspace_id: plan.workspace_id,
        session_id: plan.session_id,
        skill_ids: skillIds,
      },
      signal
    );
    this.runId = run.run_id;
    return run.run_id;
  }

  /**
   * Marks a step as started (running).
   */
  async markStepStarted(stepId: string, signal?: AbortSignal): Promise<void> {
    this.assertRunId();
    await this.learningClient.updateStepStatus(this.runId!, stepId, 'running', undefined, signal);
  }

  /**
   * Marks a step as successfully completed.
   */
  async markStepCompleted(stepId: string, signal?: AbortSignal): Promise<void> {
    this.assertRunId();
    await this.learningClient.updateStepStatus(this.runId!, stepId, 'completed', undefined, signal);
  }

  /**
   * Marks a step as failed with an error message.
   */
  async markStepFailed(stepId: string, error: string, signal?: AbortSignal): Promise<void> {
    this.assertRunId();
    await this.learningClient.updateStepStatus(this.runId!, stepId, 'failed', error, signal);
  }

  /**
   * Marks the entire run as completed.
   */
  async markRunCompleted(signal?: AbortSignal): Promise<void> {
    this.assertRunId();
    await this.learningClient.updateRunStatus(this.runId!, 'completed', signal);
  }

  /**
   * Marks the entire run as failed.
   */
  async markRunFailed(signal?: AbortSignal): Promise<void> {
    this.assertRunId();
    await this.learningClient.updateRunStatus(this.runId!, 'failed', signal);
  }

  /**
   * Marks the run as cancelled. Uses a fresh signal since the original may be aborted.
   */
  async markRunCancelled(): Promise<void> {
    if (!this.runId) return;
    // Use a fresh signal — the original AbortSignal may already be aborted
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5_000);
    try {
      await this.learningClient.updateRunStatus(this.runId, 'cancelled', controller.signal);
    } catch {
      // Best-effort — run will time out naturally if this fails
    }
  }

  getCurrentRunId(): string | null {
    return this.runId;
  }

  private assertRunId(): void {
    if (!this.runId) {
      throw new Error('RunRecorder: createRun() must be called before recording step state');
    }
  }
}
