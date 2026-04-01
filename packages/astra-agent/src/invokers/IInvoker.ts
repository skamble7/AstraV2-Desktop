import type { StagedArtifact, SkillDocument } from '../types/skill.types.js';

/**
 * IInvoker — interface for skill invocation.
 * McpInvoker handles MCP-mode skills; LlmInvoker handles LLM-mode skills.
 */
export interface IInvoker {
  invoke(
    skill: SkillDocument,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<StagedArtifact[]>;
}
