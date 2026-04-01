/**
 * StepRunner — executes a single plan step through all three phases.
 *
 * A new StepRunner instance is created for each step by ExecutionCore.
 * Phase execution order: discover → diagram → narrative
 * discover is fatal; diagram and narrative are non-fatal.
 */

import type { PlanStep } from '../types/plan.types.js';
import type { SkillDocument, StagedArtifact } from '../types/skill.types.js';
import type { DiscoverPhase } from './phases/DiscoverPhase.js';
import type { DiagramPhase } from './phases/DiagramPhase.js';
import type { NarrativePhase } from './phases/NarrativePhase.js';
import type { ArtifactPersister } from '../persistence/ArtifactPersister.js';
import type { RunRecorder } from '../persistence/RunRecorder.js';
import type { Streamer } from '../streaming/Streamer.js';

export interface StepRunnerDependencies {
  discoverPhase: DiscoverPhase;
  diagramPhase: DiagramPhase;
  narrativePhase: NarrativePhase;
  artifactPersister: ArtifactPersister;
  runRecorder: RunRecorder;
  streamer: Streamer;
}

export class StepRunner {
  private readonly deps: StepRunnerDependencies;

  constructor(deps: StepRunnerDependencies) {
    this.deps = deps;
  }

  async run(
    step: PlanStep,
    skill: SkillDocument,
    diagramSkill: SkillDocument | undefined,
    workspaceId: string,
    runId: string,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    const { discoverPhase, diagramPhase, narrativePhase, artifactPersister, runRecorder, streamer } =
      this.deps;

    // Notify start
    streamer.publish({ type: 'run:step_started', step_id: step.id, step_index: step.index });
    await runRecorder.markStepStarted(step.id, signal);

    // Phase 1 — Discover (fatal)
    let artifacts: StagedArtifact[];
    try {
      artifacts = await discoverPhase.run(step, skill, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      streamer.publish({ type: 'run:step_failed', step_id: step.id, step_index: step.index, error: message });
      await runRecorder.markStepFailed(step.id, message);
      throw error; // Re-throw to terminate the run
    }

    // Phase 2 — Diagram (non-fatal)
    artifacts = await diagramPhase.run(artifacts, diagramSkill, signal);

    // Phase 3 — Narrative (non-fatal)
    artifacts = await narrativePhase.run(artifacts, signal);

    // Persist all enriched artifacts in one batch
    await artifactPersister.batchPersist(workspaceId, artifacts, runId, signal);

    // Mark step complete
    await runRecorder.markStepCompleted(step.id, signal);
    streamer.publish({ type: 'run:step_completed', step_id: step.id, step_index: step.index });

    return artifacts;
  }
}
