/**
 * IpcRouter — central registration point for all ipcMain handlers.
 *
 * Called once from main/index.ts after app.whenReady().
 * Each handler module is responsible for its own channel registrations.
 */

import type { AgentRegistry } from '../agent/AgentRegistry.js';
import type { StreamBridge } from '../agent/StreamBridge.js';
import type { WorkspaceServiceClient } from '../services/WorkspaceServiceClient.js';
import { registerAgentIpcHandlers } from './handlers/AgentIpcHandler.js';
import { registerWorkspaceIpcHandlers } from './handlers/WorkspaceIpcHandler.js';
import { registerArtifactIpcHandlers } from './handlers/ArtifactIpcHandler.js';
import { registerConversationIpcHandlers } from './handlers/ConversationIpcHandler.js';
import { registerSkillPackIpcHandlers } from './handlers/SkillPackIpcHandler.js';

export interface IpcRouterConfig {
  workspaceManagerBaseUrl: string;
  sessionServiceBaseUrl: string; // kept for AgentServiceConfig compatibility
  skillRegistryBaseUrl: string;
  /** Identifies the local user to the conversation service. No auth in desktop — defaults to 'local'. */
  userId: string;
}

export class IpcRouter {
  private readonly agentRegistry: AgentRegistry;
  private readonly streamBridge: StreamBridge;
  private readonly workspaceClient: WorkspaceServiceClient;
  private readonly config: IpcRouterConfig;

  constructor(
    agentRegistry: AgentRegistry,
    streamBridge: StreamBridge,
    workspaceClient: WorkspaceServiceClient,
    config: IpcRouterConfig
  ) {
    this.agentRegistry = agentRegistry;
    this.streamBridge = streamBridge;
    this.workspaceClient = workspaceClient;
    this.config = config;
  }

  /**
   * Registers all IPC handlers. Call once after app.whenReady().
   */
  registerAll(): void {
    registerAgentIpcHandlers(this.agentRegistry, this.streamBridge);
    registerWorkspaceIpcHandlers(this.workspaceClient);
    registerArtifactIpcHandlers(this.config.workspaceManagerBaseUrl);
    registerConversationIpcHandlers(this.config.sessionServiceBaseUrl, this.config.userId);
    registerSkillPackIpcHandlers(this.config.skillRegistryBaseUrl);
  }
}
