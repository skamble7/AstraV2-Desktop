/**
 * SkillResolver — resolves sk.* skill identifiers to full SkillDocument objects.
 * Uses SkillManifestCache to avoid repeated network calls.
 */

import type { SkillDocument } from '../types/skill.types.js';
import type { SkillManifestCache } from './SkillManifestCache.js';

export class SkillNotFoundError extends Error {
  constructor(skillName: string) {
    super(`Skill not found: "${skillName}". Ensure it is published in the skill registry.`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillResolver {
  private readonly cache: SkillManifestCache;

  constructor(cache: SkillManifestCache) {
    this.cache = cache;
  }

  /**
   * Resolves a skill by name. Throws SkillNotFoundError if not found.
   */
  async resolve(skillName: string, signal?: AbortSignal): Promise<SkillDocument> {
    const skill = await this.cache.getByName(skillName, signal);
    if (!skill) {
      throw new SkillNotFoundError(skillName);
    }
    return skill;
  }

  /**
   * Returns all published skills for use in IntentStrategy manifest loading.
   */
  async getAllPublished(signal?: AbortSignal): Promise<SkillDocument[]> {
    return this.cache.getAll(signal);
  }
}
