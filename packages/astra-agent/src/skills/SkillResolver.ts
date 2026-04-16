/**
 * SkillResolver — resolves sk.* skill identifiers to full SkillDocument objects.
 *
 * The manifest endpoint (/skills/manifest) returns thin documents without the
 * `execution` field. The full document (including execution config) is only
 * available from the per-skill endpoint (/skill/{name}).
 *
 * resolve() uses the cache for a fast lookup and falls back to a full fetch
 * when the cached document is missing its execution config (i.e. the manifest
 * only returned a summary). The full document is then merged back into the
 * cache so subsequent calls for the same skill are served from memory.
 */

import type { SkillDocument, SkillExecution } from '../types/skill.types.js';
import type { SkillManifestCache } from './SkillManifestCache.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';

export class SkillNotFoundError extends Error {
  constructor(skillName: string) {
    super(`Skill not found: "${skillName}". Ensure it is published in the skill registry.`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillResolver {
  private readonly cache: SkillManifestCache;
  private readonly registryClient: SkillRegistryClient;
  /** In-process cache for full skill documents fetched by getSkill(). */
  private readonly fullSkillCache = new Map<string, SkillDocument>();

  constructor(cache: SkillManifestCache, registryClient: SkillRegistryClient) {
    this.cache = cache;
    this.registryClient = registryClient;
  }

  /**
   * Resolves a skill by name to a document that is guaranteed to have an
   * `execution` field. Throws SkillNotFoundError if not found.
   *
   * Strategy:
   * 1. Look up the skill in the manifest cache (fast, in-memory).
   * 2. If the cached document has `execution`, return it immediately.
   * 3. Otherwise fetch the full document from /skill/{name} and cache it
   *    locally so subsequent calls within the same run are free.
   */
  async resolve(skillName: string, signal?: AbortSignal): Promise<SkillDocument> {
    // Check the full-skill cache first (populated by prior resolve() calls)
    const cached = this.fullSkillCache.get(skillName);
    if (cached) return cached;

    const skill = await this.cache.getByName(skillName, signal);
    if (!skill) {
      throw new SkillNotFoundError(skillName);
    }

    // Manifest document is complete — return as-is
    if (skill.execution) {
      return skill;
    }

    // Manifest returned a thin document — fetch the full one
    const full = await this.registryClient.getSkill(skillName, signal);
    if (!full) {
      throw new SkillNotFoundError(skillName);
    }

    // If the registry doesn't return structured fields as top-level JSON,
    // parse them out of the skill_md_body YAML frontmatter.
    if (full.skill_md_body) {
      if (!full.execution) {
        const parsed = this.parseExecutionFromMdBody(full.skill_md_body);
        if (parsed) full.execution = parsed;
      }
      if (!full.produces_kinds || full.produces_kinds.length === 0) {
        const kinds = this.parseProducesKindsFromMdBody(full.skill_md_body);
        if (kinds.length > 0) full.produces_kinds = kinds;
      }
    }

    if (!full.execution) {
      throw new Error(
        `Skill "${skillName}" has no execution config — check its skill_md_body frontmatter.`
      );
    }

    this.fullSkillCache.set(skillName, full);
    return full;
  }

  /**
   * Returns all published skills for use in IntentStrategy manifest loading.
   * Returns thin documents (no execution) — sufficient for planning tool list.
   */
  async getAllPublished(signal?: AbortSignal): Promise<SkillDocument[]> {
    return this.cache.getAll(signal);
  }

  /**
   * Parses produces_kinds from the YAML frontmatter in skill_md_body.
   * Handles both inline list `produces_kinds: [cam.foo, cam.bar]`
   * and block list form:
   *   produces_kinds:
   *     - cam.foo
   */
  private parseProducesKindsFromMdBody(mdBody: string): string[] {
    const fmMatch = mdBody.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return [];
    const fm = fmMatch[1];

    // Inline array: produces_kinds: [cam.foo, cam.bar]
    const inlineMatch = fm.match(/^produces_kinds:\s*\[([^\]]+)\]/m);
    if (inlineMatch) {
      return inlineMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }

    // Block list:
    //   produces_kinds:
    //     - cam.foo
    const blockMatch = fm.match(/^produces_kinds:\r?\n((?:[ \t]+-[ \t]+\S+\r?\n?)+)/m);
    if (blockMatch) {
      return blockMatch[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^[ \t]+-[ \t]+/, '').trim())
        .filter(Boolean);
    }

    return [];
  }

  /**
   * Parses the YAML frontmatter in skill_md_body to extract the execution config.
   * The registry does not return execution as a top-level JSON field — it is only
   * present inside the ---...--- frontmatter block of skill_md_body.
   *
   * Handles the MCP execution shape:
   *   mode, transport, base_url, protocol_path, tool_name, timeout_sec,
   *   verify_tls, retry (max_attempts, backoff_ms, jitter_ms), headers, auth
   */
  private parseExecutionFromMdBody(mdBody: string): SkillExecution | undefined {
    // Extract the frontmatter block between the first --- pair
    const fmMatch = mdBody.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return undefined;
    const fm = fmMatch[1];

    // Pull the execution: block — everything indented under it until the next
    // top-level key (line that starts with a non-space character)
    const execMatch = fm.match(/^execution:\r?\n((?:[ \t]+.+\r?\n?)*)/m);
    if (!execMatch) return undefined;
    const execBlock = execMatch[1];

    const get = (key: string): string | undefined => {
      const m = execBlock.match(new RegExp(`^[ \\t]+${key}:\\s*["']?([^"'\\r\\n]+?)["']?\\s*$`, 'm'));
      return m?.[1]?.trim();
    };
    const getInt = (key: string): number | undefined => {
      const v = get(key);
      return v !== undefined ? parseInt(v, 10) : undefined;
    };
    const getBool = (key: string): boolean | undefined => {
      const v = get(key);
      return v !== undefined ? v === 'true' : undefined;
    };

    const mode = get('mode');
    if (mode === 'mcp') {
      // Parse headers block (key: value pairs one level deeper)
      const headersMatch = execBlock.match(/^[ \t]+headers:\r?\n((?:[ \t]{4,}.+\r?\n?)*)/m);
      const headers: Record<string, string> = {};
      if (headersMatch) {
        for (const line of headersMatch[1].split(/\r?\n/)) {
          const hm = line.match(/^[ \t]+(\S+):\s*["']?([^"'\r\n]+?)["']?\s*$/);
          if (hm) headers[hm[1]] = hm[2].trim();
        }
      }

      // Parse retry block
      const retryMatch = execBlock.match(/^[ \t]+retry:\r?\n((?:[ \t]{4,}.+\r?\n?)*)/m);
      let retry: { max_attempts: number; backoff_ms: number; jitter_ms: number } | undefined;
      if (retryMatch) {
        const rb = retryMatch[1];
        const ri = (k: string) => { const m = rb.match(new RegExp(`${k}:\\s*(\\d+)`)); return m ? parseInt(m[1], 10) : 0; };
        retry = { max_attempts: ri('max_attempts'), backoff_ms: ri('backoff_ms'), jitter_ms: ri('jitter_ms') };
      }

      return {
        mode: 'mcp',
        transport: (get('transport') ?? 'http') as 'http' | 'sse',
        base_url: get('base_url') ?? '',
        protocol_path: get('protocol_path') ?? '/mcp',
        tool_name: get('tool_name') ?? '',
        timeout_sec: getInt('timeout_sec') ?? 30,
        verify_tls: getBool('verify_tls') ?? true,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(retry ? { retry } : {}),
      };
    }

    if (mode === 'llm') {
      // Skill frontmatter uses `llm_config_ref` — also accept `config_ref` as an alias
      return { mode: 'llm', config_ref: get('llm_config_ref') ?? get('config_ref') ?? '' };
    }

    return undefined;
  }
}
