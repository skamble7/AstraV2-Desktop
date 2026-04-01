import type { Plan } from '../types/plan.types.js';
import type { AgentRunContext } from '../types/agent.types.js';

/**
 * IStrategy — interface implemented by both IntentStrategy and PackStrategy.
 * Both produce a Plan. ExecutionCore is blind to which strategy created the plan.
 */
export interface IStrategy {
  plan(context: AgentRunContext): Promise<Plan>;
}
