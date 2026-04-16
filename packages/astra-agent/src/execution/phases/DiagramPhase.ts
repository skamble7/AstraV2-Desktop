/**
 * DiagramPhase — non-fatal enrichment phase.
 *
 * Invokes sk.diagram.mermaid for each staged artifact to generate a Mermaid diagram.
 * Failure is logged and the step continues — diagrams are optional enrichment.
 */

import type { IInvoker } from '../../invokers/IInvoker.js';
import type { SkillDocument, StagedArtifact } from '../../types/skill.types.js';

export class DiagramPhase {
  private readonly mcpInvoker: IInvoker;

  constructor(mcpInvoker: IInvoker) {
    this.mcpInvoker = mcpInvoker;
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
      // Log to terminal only — diagram failure is non-fatal and spamming the chat is noisy
      console.warn(`[DiagramPhase] skipped for ${artifact.kind}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return artifact;
  }
}
