/**
 * Public API of the astra-agent library.
 *
 * Only AgentController and the types needed to use it from outside are exported.
 * Internal implementation classes (strategies, phases, invokers) are not exported —
 * they are implementation details that can evolve without breaking consumers.
 */

// Primary entry point
export { AgentController } from './controller/AgentController.js';

// Config type needed to construct AgentController / WorkspaceAgentContext
export type { AgentServiceConfig, WorkspaceResources } from './types/agent.types.js';

// Workspace-level context that owns shared resources + per-conversation controllers
export { WorkspaceAgentContext } from './WorkspaceAgentContext.js';

// Event types needed by the Electron StreamBridge and renderer IPC layer
export type { AgentEvent } from './types/stream.types.js';
export type {
  TokenEvent,
  PlanStepAddedEvent,
  RunStepStartedEvent,
  RunStepCompletedEvent,
  RunStepFailedEvent,
  RunCompletedEvent,
  RunFailedEvent,
  RunCancelledEvent,
  AskUserEvent,
  AgentNotificationEvent,
} from './types/stream.types.js';

// Plan types used by the renderer to render progress
export type { Plan, PlanStep, StepStatus } from './types/plan.types.js';

// Skill types needed by the renderer for display
export type { SkillPackDocument } from './types/skill.types.js';

// Service response types for the Electron main process service clients
export type { WorkspaceResponse, ConversationDocument } from './types/service.types.js';
