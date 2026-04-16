/**
 * AgentRegistry — holds one AgentController per workspace.
 *
 * Enforces the one-run-per-workspace concurrency model: cancelling one workspace's
 * run has zero effect on other workspaces. Multiple workspaces can each have an
 * active run simultaneously.
 */

import { AgentController } from 'astra-agent';
import type { AgentServiceConfig } from 'astra-agent';

export class AgentRegistry {
  private readonly controllers = new Map<string, AgentController>();
  private readonly config: AgentServiceConfig;

  constructor(config: AgentServiceConfig) {
    this.config = config;
  }

  /**
   * Returns the AgentController for a workspace, creating one if it does not exist.
   */
  getOrCreate(workspaceId: string): AgentController {
    const existing = this.controllers.get(workspaceId);
    if (existing) {
      return existing;
    }

    const controller = new AgentController(workspaceId, this.config);
    this.controllers.set(workspaceId, controller);
    return controller;
  }

  /**
   * Cancels the active run for a workspace. No-op if no run is in progress.
   */
  cancelRun(workspaceId: string): void {
    this.controllers.get(workspaceId)?.cancel();
  }

  /**
   * Forwards a user input token to any active controller that is awaiting it.
   * Tokens are unique UUIDs so at most one controller will respond.
   */
  provideInputToActive(token: string, value: unknown): void {
    for (const controller of this.controllers.values()) {
      controller.provideUserInput(token, value);
    }
  }

  /**
   * Resolves a pending plan approval. Tokens are unique UUIDs so at most one
   * controller will respond.
   */
  approvePlan(token: string, approved: boolean): void {
    for (const controller of this.controllers.values()) {
      controller.approvePlan(token, approved);
    }
  }

  /**
   * Removes a controller when a workspace is closed/deleted.
   */
  remove(workspaceId: string): void {
    this.controllers.get(workspaceId)?.cancel();
    this.controllers.delete(workspaceId);
  }

  /**
   * Invalidates the skill manifest cache for all controllers.
   * Called when notification-service broadcasts a skill.updated event.
   */
  invalidateAllSkillCaches(): void {
    for (const controller of this.controllers.values()) {
      controller.invalidateSkillCache();
    }
  }
}
