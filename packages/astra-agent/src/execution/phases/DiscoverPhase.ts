/**
 * DiscoverPhase — the first and only fatal phase of step execution.
 *
 * Invokes the skill via the appropriate invoker (MCP or LLM).
 * If this phase fails, the step fails and the run terminates.
 */

import type { IInvoker } from '../../invokers/IInvoker.js';
import type { SkillDocument, StagedArtifact } from '../../types/skill.types.js';
import type { PlanStep } from '../../types/plan.types.js';

export class DiscoverPhase {
  private readonly mcpInvoker: IInvoker;
  private readonly llmInvoker: IInvoker;

  constructor(mcpInvoker: IInvoker, llmInvoker: IInvoker) {
    this.mcpInvoker = mcpInvoker;
    this.llmInvoker = llmInvoker;
  }

  async run(
    step: PlanStep,
    skill: SkillDocument,
    signal: AbortSignal
  ): Promise<StagedArtifact[]> {
    const invoker = skill.execution.mode === 'mcp' ? this.mcpInvoker : this.llmInvoker;
    const artifacts = await invoker.invoke(skill, step.args, signal);

    // Stamp the step index onto each artifact
    return artifacts.map((artifact) => ({ ...artifact, step_index: step.index }));
  }
}
