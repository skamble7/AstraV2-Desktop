/**
 * NarrativePhase — non-fatal enrichment phase.
 *
 * Calls Claude directly (not via a skill) to generate a human-readable Markdown
 * narrative for each artifact. Uses the artifact-kind's narratives_spec to guide
 * the output format.
 *
 * Failure is logged and the step continues — narratives are optional enrichment.
 */

import type { AnthropicClient } from '../../types/agent.types.js';
import type { StagedArtifact } from '../../types/skill.types.js';
import type { Streamer } from '../../streaming/Streamer.js';

const NARRATIVE_MAX_TOKENS = 2048;

export class NarrativePhase {
  private readonly anthropic: AnthropicClient;
  private readonly streamer: Streamer;
  private readonly model: string;

  constructor(anthropic: AnthropicClient, streamer: Streamer, model: string) {
    this.anthropic = anthropic;
    this.streamer = streamer;
    this.model = model;
  }

  async run(artifacts: StagedArtifact[], signal: AbortSignal): Promise<StagedArtifact[]> {
    const enriched = await Promise.all(
      artifacts.map((artifact) => this.enrichArtifact(artifact, signal))
    );
    return enriched;
  }

  private async enrichArtifact(
    artifact: StagedArtifact,
    signal: AbortSignal
  ): Promise<StagedArtifact> {
    try {
      const narrative = await this.generateNarrative(artifact, signal);
      return { ...artifact, narrative };
    } catch (error) {
      this.streamer.publish({
        type: 'agent:notification',
        message: `Narrative generation skipped for ${artifact.kind}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return artifact;
    }
  }

  private async generateNarrative(
    artifact: StagedArtifact,
    signal: AbortSignal
  ): Promise<string> {
    const prompt = [
      `Generate a concise, developer-friendly narrative for the following artifact.`,
      `Artifact kind: ${artifact.kind}`,
      `Artifact data:`,
      '```json',
      JSON.stringify(artifact.data, null, 2),
      '```',
      '',
      `Write a structured Markdown document with:`,
      `- A brief overview section`,
      `- Key findings or components`,
      `- Any notable patterns or observations`,
      `- Keep it under 500 words`,
    ].join('\n');

    const message = await this.anthropic.messages.create(
      {
        model: this.model,
        max_tokens: NARRATIVE_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    );

    const content = message.content[0];
    if (content.type !== 'text') {
      return '';
    }

    return content.text;
  }
}
