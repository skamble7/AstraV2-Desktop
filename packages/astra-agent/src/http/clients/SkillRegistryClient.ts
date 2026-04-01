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

  async listPublishedSkills(signal?: AbortSignal): Promise<SkillDocument[]> {
    const response = await this.get<SkillListResponse>('/skills?status=published', signal);
    // The registry returns full SkillDocument objects in list mode
    return response.skills as unknown as SkillDocument[];
  }

  async getSkill(skillName: string, signal?: AbortSignal): Promise<SkillDocument> {
    return this.get<SkillDocument>(`/skills/${encodeURIComponent(skillName)}`, signal);
  }

  async listPublishedSkillPacks(signal?: AbortSignal): Promise<SkillPackSummary[]> {
    const response = await this.get<SkillPackListResponse>('/skill-packs?status=published', signal);
    return response.packs;
  }

  async getSkillPack(
    packKey: string,
    packVersion?: string,
    signal?: AbortSignal
  ): Promise<SkillPackDocument> {
    const versionParam = packVersion ? `?version=${encodeURIComponent(packVersion)}` : '';
    return this.get<SkillPackDocument>(
      `/skill-packs/${encodeURIComponent(packKey)}${versionParam}`,
      signal
    );
  }
}
