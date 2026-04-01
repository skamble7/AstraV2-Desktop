/**
 * RunRecorder — lightweight in-process run/step state tracker.
 *
 * There is no external run-ledger service in the skill-based flow.
 * The conductor-service (port 9022) is the old Python planner and is not called
 * by the TypeScript agent. This class tracks run state in memory only,
 * primarily so the Streamer can emit accurate step status events.
 */

import { randomUUID } from 'node:crypto';
import type { Plan } from '../types/plan.types.js';

export class RunRecorder {
  private runId: string | null = null;

  // No constructor arguments — no external service dependency.

  /**
   * Initialises a run record and returns a local run_id.
   */
  async createRun(plan: Plan, _signal?: AbortSignal): Promise<string> {
    const id = plan.session_id ? `run-${randomUUID()}` : randomUUID();
    this.runId = id;
    return id;
  }

  async markStepStarted(_stepId: string, _signal?: AbortSignal): Promise<void> { /* no-op */ }
  async markStepCompleted(_stepId: string, _signal?: AbortSignal): Promise<void> { /* no-op */ }
  async markStepFailed(_stepId: string, _error: string, _signal?: AbortSignal): Promise<void> { /* no-op */ }
  async markRunCompleted(_signal?: AbortSignal): Promise<void> { /* no-op */ }
  async markRunFailed(_signal?: AbortSignal): Promise<void> { /* no-op */ }
  async markRunCancelled(): Promise<void> { /* no-op */ }

  getCurrentRunId(): string | null {
    return this.runId;
  }
}
