/**
 * PackStrategy — deterministic planning strategy.
 *
 * Reads the playbook directly from a SkillPackDocument.
 * No LLM call is made for planning — the plan is derived directly from
 * the pack's ordered playbook steps. Fast and reproducible.
 */

import type { IStrategy } from './IStrategy.js';
import type { Plan, PlanStep } from '../types/plan.types.js';
import type { AgentRunContext } from '../types/agent.types.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';

export class PackStrategy implements IStrategy {
  private readonly skillRegistryClient: SkillRegistryClient;

  constructor(skillRegistryClient: SkillRegistryClient) {
    this.skillRegistryClient = skillRegistryClient;
  }

  async plan(context: AgentRunContext): Promise<Plan> {
    const { pack_key, pack_version, pack_inputs, workspace_id, session_id, signal } = context;

    if (!pack_key) {
      throw new Error('PackStrategy requires pack_key in AgentRunContext');
    }

    const packDoc = await this.skillRegistryClient.getSkillPack(pack_key, pack_version, signal);

    const steps: PlanStep[] = packDoc.playbook.steps.map((playStep, index) => ({
      id: `step-${index}`,
      name: this.buildStepName(playStep.skill_id),
      skill_id: playStep.skill_id,
      args: (pack_inputs as Record<string, unknown>) ?? {},
      status: 'pending',
      index,
    }));

    return {
      steps,
      session_id,
      workspace_id,
    };
  }

  private buildStepName(skillId: string): string {
    // Convert sk.asset.fetch_raina_input → "Fetch Raina Input"
    const parts = skillId.split('.');
    const action = parts.slice(2).join(' ');
    return action
      .split(/[_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
