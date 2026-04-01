/**
 * SkillManifestCache — in-memory cache of published skills from skill-registry-service.
 *
 * Cache strategy:
 *  1. TTL of 5 minutes (configurable).
 *  2. Immediate invalidation via WebSocket events from notification-service
 *     when a skill.created or skill.updated event is received.
 */

import type { SkillDocument } from '../types/skill.types.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SkillManifestCache {
  private skills: SkillDocument[] | null = null;
  private lastFetchedAt: number | null = null;
  private readonly ttlMs: number;
  private readonly skillRegistryClient: SkillRegistryClient;

  constructor(skillRegistryClient: SkillRegistryClient, ttlMs: number = DEFAULT_TTL_MS) {
    this.skillRegistryClient = skillRegistryClient;
    this.ttlMs = ttlMs;
  }

  /**
   * Returns all published skills. Fetches from registry if cache is stale.
   */
  async getAll(signal?: AbortSignal): Promise<SkillDocument[]> {
    if (this.isCacheValid()) {
      return this.skills!;
    }

    try {
      this.skills = await this.skillRegistryClient.listPublishedSkills(signal);
    } catch {
      // Skill registry unavailable — degrade gracefully to pure conversation mode.
      this.skills = [];
    }
    this.lastFetchedAt = Date.now();
    return this.skills;
  }

  /**
   * Returns a single skill by name. Fetches from getAll() — uses cache if valid.
   */
  async getByName(skillName: string, signal?: AbortSignal): Promise<SkillDocument | undefined> {
    const all = await this.getAll(signal);
    return all.find((skill) => skill.name === skillName);
  }

  /**
   * Invalidates the cache immediately. Called when a WebSocket skill event is received
   * from notification-service, or when tests need a clean state.
   */
  invalidate(): void {
    this.skills = null;
    this.lastFetchedAt = null;
  }

  private isCacheValid(): boolean {
    if (this.skills === null || this.lastFetchedAt === null) {
      return false;
    }
    return Date.now() - this.lastFetchedAt < this.ttlMs;
  }
}
