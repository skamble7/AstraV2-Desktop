/**
 * AgentEvent discriminated union — the typed event contract between the Astra Agent
 * and the Electron IPC layer. Every event emitted by Streamer uses this type.
 * These are IPC-safe: no functions, no class instances, JSON-serialisable.
 */

import type { PlanStep, StepStatus } from './plan.types.js';

export type AgentEvent =
  | TokenEvent
  | PlanStepAddedEvent
  | RunStepStartedEvent
  | RunStepCompletedEvent
  | RunStepFailedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent
  | AskUserEvent
  | AgentNotificationEvent;

/** A raw token delta streamed from the Anthropic SDK during planning narration. */
export interface TokenEvent {
  type: 'token';
  delta: string;
}

/** Emitted progressively as Claude decides each step during intent-driven planning. */
export interface PlanStepAddedEvent {
  type: 'plan:step_added';
  step: PlanStep;
}

/** Emitted when execution of a plan step begins (discover phase starts). */
export interface RunStepStartedEvent {
  type: 'run:step_started';
  step_id: string;
  step_index: number;
}

/** Emitted when all three phases of a step complete successfully. */
export interface RunStepCompletedEvent {
  type: 'run:step_completed';
  step_id: string;
  step_index: number;
}

/** Emitted when the discover phase of a step fails (fatal — terminates the run). */
export interface RunStepFailedEvent {
  type: 'run:step_failed';
  step_id: string;
  step_index: number;
  error: string;
}

/** Emitted when all steps in the plan complete successfully. */
export interface RunCompletedEvent {
  type: 'run:completed';
  run_id: string;
}

/** Emitted when the run terminates due to an error. */
export interface RunFailedEvent {
  type: 'run:failed';
  error: string;
}

/** Emitted when the run is cancelled via AgentController.cancel(). */
export interface RunCancelledEvent {
  type: 'run:cancelled';
}

/**
 * Emitted when Claude invokes the ask_user tool.
 * Execution suspends until AgentController.provideUserInput() is called with the token.
 */
export interface AskUserEvent {
  type: 'agent:ask_user';
  token: string;
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}

/** Non-step narration from Claude — informational text between steps. */
export interface AgentNotificationEvent {
  type: 'agent:notification';
  message: string;
}

/** Step status update — used by the renderer to update plan progress display. */
export interface StepStatusUpdateEvent {
  type: 'step:status_update';
  step_id: string;
  status: StepStatus;
}
