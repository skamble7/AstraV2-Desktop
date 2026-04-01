/**
 * DiagramPhase — non-fatal enrichment phase.
 *
 * Invokes sk.diagram.mermaid for each staged artifact to generate a Mermaid diagram.
 * Failure is logged and the step continues — diagrams are optional enrichment.
 */

import type { IInvoker } from '../../invokers/IInvoker.js';
import type { SkillDocument, StagedArtifact } from '../../types/skill.types.js';
import type { Streamer } from '../../streaming/Streamer.js';

export class DiagramPhase {
  private readonly mcpInvoker: IInvoker;
  private readonly streamer: Streamer;

  constructor(mcpInvoker: IInvoker, streamer: Streamer) {
    this.mcpInvoker = mcpInvoker;
    this.streamer = streamer;
  }

  async run(
    artifacts: StagedArtifact[],
    diagramSkill: SkillDocument | undefined,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    if (!diagramSkill) {
      return artifacts;
    }

    const enriched = await Promise.all(
      artifacts.map((artifact) => this.enrichArtifact(artifact, diagramSkill, signal))
    );

    return enriched;
  }

  private async enrichArtifact(
    artifact: StagedArtifact,
    diagramSkill: SkillDocument,
    signal: AbortSignal
  ): Promise<StagedArtifact> {
    try {
      const results = await this.mcpInvoker.invoke(
        diagramSkill,
        { artifact_data: artifact.data, artifact_kind: artifact.kind },
        signal
      );

      const diagramResult = results[0];
      if (diagramResult) {
        const diagramText =
          typeof diagramResult.data === 'string'
            ? diagramResult.data
            : JSON.stringify(diagramResult.data);
        return { ...artifact, diagram: diagramText };
      }
    } catch (error) {
      this.streamer.publish({
        type: 'agent:notification',
        message: `Diagram generation skipped for ${artifact.kind}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return artifact;
  }
}
