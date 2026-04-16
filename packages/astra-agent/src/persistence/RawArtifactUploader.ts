/**
 * RawArtifactUploader — Branch B execution for general file-producing skills.
 *
 * Extracts a file payload from the MCP tool result (base64 string or URL),
 * then stores it as a JSON artifact via workspace-manager-service's existing
 * POST /artifact/{workspaceId} endpoint.
 *
 * The artifact `data` field carries { filename, mime_type, content } where
 * `content` is a base64-encoded string. No S3 or dedicated file upload needed —
 * workspace-manager-service stores it as a MongoDB document.
 */

import type { WorkspaceManagerClient } from '../http/clients/WorkspaceManagerClient.js';
import type { Streamer } from '../streaming/Streamer.js';
import type { SkillDocument, RawArtifactEnvelope } from '../types/skill.types.js';

export class RawArtifactUploader {
  private readonly workspaceManagerClient: WorkspaceManagerClient;
  private readonly streamer: Streamer;

  constructor(workspaceManagerClient: WorkspaceManagerClient, streamer: Streamer) {
    this.workspaceManagerClient = workspaceManagerClient;
    this.streamer = streamer;
  }

  async upload(
    workspaceId: string,
    runId: string,
    skill: SkillDocument,
    artifactData: unknown,
    signal: AbortSignal
  ): Promise<void> {
    const envelope = skill.raw_artifact_envelope as RawArtifactEnvelope;
    const kind = skill.produces_kinds?.[0] ?? 'cam.general.file';

    const content = await this.extractBase64Content(envelope, artifactData, signal);

    const filename = this.resolveFilename(envelope.filename_template, workspaceId, runId, skill.name);

    const response = await this.workspaceManagerClient.upsertArtifact(
      workspaceId,
      {
        kind,
        name: filename,
        data: { filename, mime_type: envelope.mime_type, content },
        skill_name: skill.name,
        run_id: runId,
      },
      signal
    );

    this.streamer.publish({
      type: 'agent:raw_artifact_uploaded',
      artifact_id: response.id,
      filename,
      mime_type: envelope.mime_type,
      kind,
    });
  }

  /**
   * Extracts a base64 string from the tool result based on the envelope content_type.
   *
   * For 'base64': expects the result to be a raw string or an object with a `content` field.
   * For 'url': fetches the URL and converts the response body to base64.
   */
  private async extractBase64Content(
    envelope: RawArtifactEnvelope,
    toolResult: unknown,
    signal: AbortSignal
  ): Promise<string> {
    if (envelope.content_type === 'base64') {
      if (typeof toolResult === 'string') {
        return toolResult;
      }
      if (toolResult !== null && typeof toolResult === 'object') {
        const obj = toolResult as Record<string, unknown>;
        if (typeof obj['content'] === 'string') {
          return obj['content'];
        }
      }
      // Fallback: JSON-encode and base64 it
      return Buffer.from(JSON.stringify(toolResult)).toString('base64');
    }

    // content_type === 'url'
    let url: string;
    if (typeof toolResult === 'string') {
      url = toolResult;
    } else if (toolResult !== null && typeof toolResult === 'object') {
      const obj = toolResult as Record<string, unknown>;
      url = String(obj['url'] ?? obj['download_url'] ?? obj['href'] ?? '');
    } else {
      throw new Error('RawArtifactUploader: tool result does not contain a URL to fetch.');
    }

    const fetchResponse = await fetch(url, { signal });
    if (!fetchResponse.ok) {
      throw new Error(
        `RawArtifactUploader: failed to fetch artifact URL — ${fetchResponse.status} ${fetchResponse.statusText}`
      );
    }
    const buffer = await fetchResponse.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  /**
   * Resolves a filename template by substituting known placeholder tokens.
   * Supported: {workspace_id}, {run_id}, {skill_name}
   */
  private resolveFilename(
    template: string,
    workspaceId: string,
    runId: string,
    skillName: string
  ): string {
    return template
      .replace('{workspace_id}', workspaceId)
      .replace('{run_id}', runId)
      .replace('{skill_name}', skillName.replace(/\./g, '_'));
  }
}
