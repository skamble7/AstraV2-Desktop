import { describe, it, expect, vi } from 'vitest';
import { PackStrategy } from './PackStrategy.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import type { SkillPackDocument } from '../types/skill.types.js';
import type { AgentRunContext } from '../types/agent.types.js';

function makePackDoc(overrides: Partial<SkillPackDocument> = {}): SkillPackDocument {
  return {
    key: 'pack.agile.sprint_kickoff',
    version: '1.0.0',
    title: 'Sprint Kickoff',
    description: 'Sets up a sprint',
    skill_ids: ['sk.agile.generate_user_story', 'sk.agile.generate_acceptance_criteria'],
    playbook: {
      steps: [
        { skill_id: 'sk.agile.generate_user_story' },
        { skill_id: 'sk.agile.generate_acceptance_criteria' },
      ],
    },
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    workspace_id: 'ws-1',
    session_id: 'sess-1',
    run_id: 'run-test-1',
    mode: 'pack',
    pack_key: 'pack.agile.sprint_kickoff',
    pack_version: '1.0.0',
    pack_inputs: { sprint_goal: 'Ship auth' },
    anthropic: {} as AgentRunContext['anthropic'],
    plannerModel: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('PackStrategy', () => {
  it('maps playbook steps to PlanStep[] with correct skill_id', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(makeContext());

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]!.skill_id).toBe('sk.agile.generate_user_story');
    expect(plan.steps[1]!.skill_id).toBe('sk.agile.generate_acceptance_criteria');
  });

  it('assigns sequential index to each step', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(makeContext());

    expect(plan.steps[0]!.index).toBe(0);
    expect(plan.steps[1]!.index).toBe(1);
  });

  it('all steps start with status pending', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(makeContext());

    for (const step of plan.steps) {
      expect(step.status).toBe('pending');
    }
  });

  it('builds human-readable step name from skill_id', async () => {
    const packDoc = makePackDoc({
      playbook: { steps: [{ skill_id: 'sk.agile.generate_user_story' }] },
    });
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(makeContext());

    // "sk.agile.generate_user_story" → "Generate User Story"
    expect(plan.steps[0]!.name).toBe('Generate User Story');
  });

  it('passes pack_inputs as args to every step', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const context = makeContext({ pack_inputs: { sprint_goal: 'Ship auth', team: 'platform' } });
    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(context);

    for (const step of plan.steps) {
      expect(step.args).toEqual({ sprint_goal: 'Ship auth', team: 'platform' });
    }
  });

  it('propagates workspace_id and session_id to the plan', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const plan = await strategy.plan(makeContext({ workspace_id: 'ws-xyz', session_id: 'sess-abc' }));

    expect(plan.workspace_id).toBe('ws-xyz');
    expect(plan.session_id).toBe('sess-abc');
  });

  it('throws when pack_key is missing from context', async () => {
    const client = {
      getSkillPack: vi.fn(),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    // Omit pack_key to simulate a missing value (can't pass undefined with exactOptionalPropertyTypes)
    const { pack_key: _omitted, ...contextWithoutPackKey } = makeContext();
    const context = contextWithoutPackKey as AgentRunContext;

    await expect(strategy.plan(context)).rejects.toThrow('PackStrategy requires pack_key');
  });

  it('forwards the AbortSignal to the registry client', async () => {
    const packDoc = makePackDoc();
    const client = {
      getSkillPack: vi.fn().mockResolvedValue(packDoc),
    } as unknown as SkillRegistryClient;

    const strategy = new PackStrategy(client);
    const controller = new AbortController();
    await strategy.plan(makeContext({ signal: controller.signal }));

    expect(client.getSkillPack).toHaveBeenCalledWith(
      'pack.agile.sprint_kickoff',
      '1.0.0',
      controller.signal,
    );
  });
});
