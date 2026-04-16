/**
 * StepRunner — executes a single plan step, routing to the correct branch
 * based on the skill's domain and raw_artifact_envelope.
 *
 * Branch A — domain: 'astra' (default)
 *   Full 3-phase pipeline: discover → diagram → narrative → persist to MongoDB
 *
 * Branch B — domain: 'general' + raw_artifact_envelope defined
 *   Invoke skill, extract file payload, store as JSON artifact. No enrichment.
 *
 * Branch C — domain: 'general', no raw_artifact_envelope
 *   Invoke skill, feed raw result back to Claude for conversational narration. No persistence.
 *
 * discover is fatal in all branches; diagram and narrative are non-fatal (Branch A only).
 */

import type { PlanStep } from '../types/plan.types.js';
import type { SkillDocument, StagedArtifact } from '../types/skill.types.js';
import type { AnthropicClient } from '../types/agent.types.js';
import type { DiscoverPhase } from './phases/DiscoverPhase.js';
import type { DiagramPhase } from './phases/DiagramPhase.js';
import type { NarrativePhase } from './phases/NarrativePhase.js';
import type { ArtifactPersister } from '../persistence/ArtifactPersister.js';
import type { RawArtifactUploader } from '../persistence/RawArtifactUploader.js';
import type { RunRecorder } from '../persistence/RunRecorder.js';
import type { Streamer } from '../streaming/Streamer.js';

export interface StepRunnerDependencies {
  discoverPhase: DiscoverPhase;
  diagramPhase: DiagramPhase;
  narrativePhase: NarrativePhase;
  artifactPersister: ArtifactPersister;
  rawArtifactUploader: RawArtifactUploader;
  runRecorder: RunRecorder;
  streamer: Streamer;
  /** LLM client — used for Branch C conversational narration. */
  anthropic: AnthropicClient;
  /** Model ID — used for Branch C conversational narration. */
  plannerModel: string;
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
    const {
      discoverPhase,
      diagramPhase,
      narrativePhase,
      artifactPersister,
      rawArtifactUploader,
      runRecorder,
      streamer,
      anthropic,
      plannerModel,
    } = this.deps;

    console.log(`[StepRunner] step ${step.index + 1} START: ${step.skill_id} (domain: ${skill.domain ?? 'astra'})`);
    streamer.publish({ type: 'run:step_started', step_id: step.id, step_index: step.index });
    await runRecorder.markStepStarted(step.id, signal);

    const domain = skill.domain ?? 'astra';

    // ── Phase 1: Discover (fatal in all branches) ─────────────────────────────
    let artifacts: StagedArtifact[];
    try {
      artifacts = await discoverPhase.run(step, skill, signal);
      console.log(`[StepRunner] discover OK: ${artifacts.length} artifact(s) — kinds: ${artifacts.map((a) => a.kind).join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[StepRunner] discover FAILED for ${step.skill_id}:`, message);
      streamer.publish({ type: 'run:step_failed', step_id: step.id, step_index: step.index, error: message });
      await runRecorder.markStepFailed(step.id, message);
      throw error; // Re-throw to terminate the run
    }

    // ── Branch routing ────────────────────────────────────────────────────────

    if (domain === 'astra') {
      // ── Branch A: full ASTRA 3-phase pipeline ──────────────────────────────
      artifacts = await diagramPhase.run(artifacts, diagramSkill, signal);
      artifacts = await narrativePhase.run(artifacts, signal);
      console.log(`[StepRunner] persisting ${artifacts.length} artifact(s) for step ${step.index + 1}`);
      await artifactPersister.batchPersist(workspaceId, artifacts, runId, signal);
      console.log(`[StepRunner] persist OK for step ${step.index + 1}`);

    } else if (skill.raw_artifact_envelope) {
      // ── Branch B: file-producing general skill ─────────────────────────────
      // Upload the file payload from the first artifact's data field.
      // No enrichment phases; no ASTRA artifact pipeline.
      const rawData = artifacts[0]?.data;
      await rawArtifactUploader.upload(workspaceId, runId, skill, rawData, signal);

    } else {
      // ── Branch C: conversational general skill ─────────────────────────────
      // Feed the raw tool result back to Claude so it can narrate conversationally.
      // No persistence of any kind.
      const rawData = artifacts[0]?.data;
      const resultText =
        typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);

      const narrateStream = anthropic.messages.stream(
        {
          model: plannerModel,
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: `The skill "${skill.name}" returned the following result. Please explain it clearly to the user:\n\n${resultText}`,
            },
          ],
        },
        { signal }
      );

      narrateStream.on('text', (text: string) => {
        if (text) {
          streamer.publish({ type: 'token', delta: text });
        }
      });

      await narrateStream.finalMessage();
    }

    // ── Complete ──────────────────────────────────────────────────────────────
    await runRecorder.markStepCompleted(step.id, signal);
    streamer.publish({ type: 'run:step_completed', step_id: step.id, step_index: step.index });

    return artifacts;
  }
}
