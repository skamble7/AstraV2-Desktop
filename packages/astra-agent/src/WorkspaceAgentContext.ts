/**
 * WorkspaceAgentContext — owns all shared resources for a single workspace and
 * manages one AgentController per conversation.
 *
 * Shared resources (HTTP clients, caches, skill resolver) are created once here
 * and injected into every AgentController for the workspace so that:
 *  - The SkillManifestCache is shared across conversations (one TTL, one invalidation)
 *  - HTTP clients are stateless and safely reused
 *
 * Per-conversation state (Streamer, AbortController, resolver maps) lives inside
 * each AgentController and is never shared.
 */

import { AgentController } from './controller/AgentController.js';
import { SessionClient } from './http/clients/SessionClient.js';
import { SkillRegistryClient } from './http/clients/SkillRegistryClient.js';
import { WorkspaceManagerClient } from './http/clients/WorkspaceManagerClient.js';
import { ConfigForgeClient } from './http/clients/ConfigForgeClient.js';
import { ArtifactRegistryClient } from './http/clients/ArtifactRegistryClient.js';
import { LlmClientFactory } from './http/clients/LlmClientFactory.js';
import { SkillManifestCache } from './skills/SkillManifestCache.js';
import { SkillResolver } from './skills/SkillResolver.js';
import { SkillToToolConverter } from './skills/SkillToToolConverter.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import { ArtifactPersister } from './persistence/ArtifactPersister.js';
import type { AgentServiceConfig, WorkspaceResources } from './types/agent.types.js';

export class WorkspaceAgentContext {
  readonly workspaceId: string;

  private readonly resources: WorkspaceResources;
  private readonly controllers = new Map<string, AgentController>();

  constructor(workspaceId: string, config: AgentServiceConfig) {
    this.workspaceId = workspaceId;

    const sessionClient = new SessionClient({ baseUrl: config.sessionServiceBaseUrl });
    const skillRegistryClient = new SkillRegistryClient({ baseUrl: config.skillRegistryBaseUrl });
    const workspaceManagerClient = new WorkspaceManagerClient({ baseUrl: config.workspaceManagerBaseUrl });
    const configForgeClient = new ConfigForgeClient({ baseUrl: config.configForgeBaseUrl });
    const artifactRegistryClient = new ArtifactRegistryClient({ baseUrl: config.artifactServiceBaseUrl });
    const llmClientFactory = new LlmClientFactory(configForgeClient, config.plannerConfigRef);
    const skillManifestCache = new SkillManifestCache(skillRegistryClient);
    const skillToToolConverter = new SkillToToolConverter();
    const skillResolver = new SkillResolver(skillManifestCache, skillRegistryClient);
    const toolRegistry = new ToolRegistry(skillToToolConverter);
    const artifactPersister = new ArtifactPersister(workspaceManagerClient);

    this.resources = {
      workspaceId,
      sessionClient,
      skillRegistryClient,
      workspaceManagerClient,
      configForgeClient,
      artifactRegistryClient,
      llmClientFactory,
      skillManifestCache,
      skillResolver,
      skillToToolConverter,
      toolRegistry,
      artifactPersister,
    };
  }

  /**
   * Returns the AgentController for the given conversation, creating one if needed.
   */
  getOrCreateController(conversationId: string): AgentController {
    const existing = this.controllers.get(conversationId);
    if (existing) return existing;

    const controller = new AgentController(this.resources);
    this.controllers.set(conversationId, controller);
    return controller;
  }

  /**
   * Cancels the active run for a specific conversation. No-op if none active.
   */
  cancelConversation(conversationId: string): void {
    this.controllers.get(conversationId)?.cancel();
  }

  /**
   * Cancels and removes the controller for a conversation (e.g. on delete).
   */
  removeController(conversationId: string): void {
    this.controllers.get(conversationId)?.cancel();
    this.controllers.delete(conversationId);
  }

  /**
   * Iterates all conversation controllers. Used for token-based broadcasts
   * (ask_user responses, plan approvals) where the token identifies the target.
   */
  forEachController(fn: (controller: AgentController) => void): void {
    for (const controller of this.controllers.values()) {
      fn(controller);
    }
  }

  /**
   * Invalidates the shared skill manifest cache. One call covers all conversations
   * in this workspace since they share the same SkillManifestCache instance.
   */
  invalidateSkillCache(): void {
    this.resources.skillManifestCache.invalidate();
  }

  /**
   * Cancels all active runs and clears all controllers (e.g. on workspace close).
   */
  dispose(): void {
    for (const controller of this.controllers.values()) {
      controller.cancel();
    }
    this.controllers.clear();
  }
}
