import { ServiceClient, type ServiceClientConfig } from '../ServiceClient.js';
import type {
  SkillListResponse,
  SkillPackListResponse,
  SkillPackSummary,
} from '../../types/service.types.js';
import type { SkillDocument, SkillPackDocument } from '../../types/skill.types.js';

export class SkillRegistryClient extends ServiceClient {
  constructor(config: ServiceClientConfig) {
    super(config);
  }

  /**
   * Returns all published skills via the manifest endpoint.
   * GET /manifest/skills
   */
  async listPublishedSkills(signal?: AbortSignal): Promise<SkillDocument[]> {
    const response = await this.get<SkillListResponse>('/skills/manifest', signal);
    return response.skills as unknown as SkillDocument[];
  }

  /**
   * Returns a single skill by name.
   * GET /skill/{name}
   */
  async getSkill(skillName: string, signal?: AbortSignal): Promise<SkillDocument> {
    return this.get<SkillDocument>(`/skills/${encodeURIComponent(skillName)}`, signal);
  }

  /**
   * Returns all published skill packs.
   * GET /skill-pack?status=published
   */
  async listPublishedSkillPacks(signal?: AbortSignal): Promise<SkillPackSummary[]> {
    const response = await this.get<SkillPackListResponse>('/skill-pack?status=published', signal);
    return response.packs;
  }

  /**
   * Returns a single skill pack by key and optional version.
   * GET /skill-pack/{pack_id}?version={version}
   */
  async getSkillPack(
    packKey: string,
    packVersion?: string,
    signal?: AbortSignal
  ): Promise<SkillPackDocument> {
    const versionParam = packVersion ? `?version=${encodeURIComponent(packVersion)}` : '';
    return this.get<SkillPackDocument>(
      `/skill-pack/${encodeURIComponent(packKey)}${versionParam}`,
      signal
    );
  }
}
