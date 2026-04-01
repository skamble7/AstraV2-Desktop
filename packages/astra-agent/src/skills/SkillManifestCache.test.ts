import { describe, it, expect, vi } from 'vitest';
import { SkillManifestCache } from './SkillManifestCache.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import type { SkillDocument } from '../types/skill.types.js';

function makeSkill(name: string): SkillDocument {
  return {
    name,
    description: `${name} description`,
    execution: { mode: 'mcp', transport: 'http', base_url: 'http://localhost:9028', protocol_path: '/mcp', tool_name: name, timeout_sec: 30, verify_tls: false },
    produces_kinds: ['cam.test.result'],
    status: 'published',
    version: '1.0.0',
    skill_md_body: `# ${name}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeRegistryClient(skills: SkillDocument[]): SkillRegistryClient {
  return {
    listPublishedSkills: vi.fn().mockResolvedValue(skills),
  } as unknown as SkillRegistryClient;
}

describe('SkillManifestCache', () => {
  it('fetches skills on first call', async () => {
    const skills = [makeSkill('sk.test.alpha')];
    const client = makeRegistryClient(skills);
    const cache = new SkillManifestCache(client, 60_000);

    const result = await cache.getAll();

    expect(result).toEqual(skills);
    expect(client.listPublishedSkills).toHaveBeenCalledOnce();
  });

  it('returns cached result on second call within TTL', async () => {
    const skills = [makeSkill('sk.test.alpha')];
    const client = makeRegistryClient(skills);
    const cache = new SkillManifestCache(client, 60_000);

    await cache.getAll();
    await cache.getAll();

    expect(client.listPublishedSkills).toHaveBeenCalledOnce();
  });

  it('re-fetches after TTL expires', async () => {
    const skills = [makeSkill('sk.test.alpha')];
    const client = makeRegistryClient(skills);
    // TTL of 0 ms — always stale
    const cache = new SkillManifestCache(client, 0);

    await cache.getAll();
    await cache.getAll();

    expect(client.listPublishedSkills).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after invalidate() is called', async () => {
    const skills = [makeSkill('sk.test.alpha')];
    const client = makeRegistryClient(skills);
    const cache = new SkillManifestCache(client, 60_000);

    await cache.getAll();
    cache.invalidate();
    await cache.getAll();

    expect(client.listPublishedSkills).toHaveBeenCalledTimes(2);
  });

  it('getByName returns the matching skill', async () => {
    const skills = [makeSkill('sk.test.alpha'), makeSkill('sk.test.beta')];
    const client = makeRegistryClient(skills);
    const cache = new SkillManifestCache(client, 60_000);

    const result = await cache.getByName('sk.test.beta');

    expect(result?.name).toBe('sk.test.beta');
  });

  it('getByName returns undefined for unknown skill', async () => {
    const client = makeRegistryClient([]);
    const cache = new SkillManifestCache(client, 60_000);

    const result = await cache.getByName('sk.does.not.exist');

    expect(result).toBeUndefined();
  });
});
