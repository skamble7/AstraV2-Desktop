/**
 * Types representing the execution plan produced by a strategy.
 * Both IntentStrategy and PackStrategy produce a Plan — ExecutionCore is blind to the source.
 */

import type Anthropic from '@anthropic-ai/sdk';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PlanStep {
  /**
   * Unique identifier within this plan run (e.g. "step-0", "step-1").
   */
  id: string;
  /**
   * Human-readable name shown in the UI — never the sk.* identifier.
   */
  name: string;
  /**
   * The sk.* skill identifier used for resolution.
   */
  skill_id: string;
  /**
   * Runtime arguments for this step, supplied by Claude or from pack inputs.
   */
  args: Record<string, unknown>;
  status: StepStatus;
  /**
   * Index in the plan (0-based), used to correlate with artifacts.
   */
  index: number;
}

export interface Plan {
  steps: PlanStep[];
  /**
   * The session this plan belongs to.
   */
  session_id: string;
  /**
   * The workspace this plan executes in.
   */
  workspace_id: string;
  /**
   * Full conversation message array after this plan turn completed.
   * Set by IntentStrategy; used by AgentController to persist history to session service.
   */
  updatedMessages?: Anthropic.MessageParam[];
}
