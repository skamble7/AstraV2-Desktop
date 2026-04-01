/**
 * ExecutionCore — the plan step loop.
 *
 * Iterates over plan steps, creates a StepRunner for each, and runs them sequentially.
 * If any step's discover phase fails, the loop terminates the run as failed.
 * ExecutionCore is strategy-blind — it receives a Plan and executes it.
 */

import type { Plan } from '../types/plan.types.js';
import type { SkillResolver } from '../skills/SkillResolver.js';
import type { StepRunnerDependencies } from './StepRunner.js';
import { StepRunner } from './StepRunner.js';
import type { RunRecorder } from '../persistence/RunRecorder.js';
import type { Streamer } from '../streaming/Streamer.js';

export interface ExecutionCoreDependencies {
  skillResolver: SkillResolver;
  stepRunnerDeps: StepRunnerDependencies;
  runRecorder: RunRecorder;
  streamer: Streamer;
}

export class ExecutionCore {
  private readonly deps: ExecutionCoreDependencies;

  constructor(deps: ExecutionCoreDependencies) {
    this.deps = deps;
  }

  async execute(
    plan: Plan,
    workspaceId: string,
    signal: AbortSignal
  ): Promise<void> {
    const { skillResolver, stepRunnerDeps, runRecorder, streamer } = this.deps;

    const runId = await runRecorder.createRun(plan, signal);

    // Pre-resolve the diagram skill (used across all steps for enrichment)
    const diagramSkill = await skillResolver
      .resolve('sk.diagram.mermaid', signal)
      .catch(() => undefined); // Optional — may not be registered

    try {
      for (const step of plan.steps) {
        if (signal.aborted) {
          break;
        }

        const skill = await skillResolver.resolve(step.skill_id, signal);
        const runner = new StepRunner(stepRunnerDeps);

        await runner.run(step, skill, diagramSkill, workspaceId, runId, signal);
      }

      if (signal.aborted) {
        await runRecorder.markRunCancelled();
        streamer.publish({ type: 'run:cancelled' });
      } else {
        await runRecorder.markRunCompleted(signal);
        streamer.publish({ type: 'run:completed', run_id: runId });
      }
    } catch (error) {
      if (signal.aborted) {
        await runRecorder.markRunCancelled();
        streamer.publish({ type: 'run:cancelled' });
      } else {
        await runRecorder.markRunFailed(signal);
        const message = error instanceof Error ? error.message : String(error);
        streamer.publish({ type: 'run:failed', error: message });
        throw error;
      }
    }
  }
}
