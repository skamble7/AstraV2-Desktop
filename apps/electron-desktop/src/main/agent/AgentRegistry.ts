/**
 * AgentRegistry — holds one WorkspaceAgentContext per workspace.
 *
 * Each WorkspaceAgentContext manages shared workspace-level resources and a
 * Map<conversationId, AgentController>. This enables multiple conversations
 * within the same workspace to run agents concurrently and independently.
 */

import { WorkspaceAgentContext } from 'astra-agent';
import type { AgentServiceConfig } from 'astra-agent';

export class AgentRegistry {
  private readonly contexts = new Map<string, WorkspaceAgentContext>();
  private readonly config: AgentServiceConfig;

  constructor(config: AgentServiceConfig) {
    this.config = config;
  }

  /**
   * Returns the WorkspaceAgentContext for a workspace, creating one if needed.
   */
  private getOrCreateContext(workspaceId: string): WorkspaceAgentContext {
    const existing = this.contexts.get(workspaceId);
    if (existing) return existing;

    const context = new WorkspaceAgentContext(workspaceId, this.config);
    this.contexts.set(workspaceId, context);
    return context;
  }

  /**
   * Returns the AgentController for a specific conversation, creating it if needed.
   */
  getOrCreateController(workspaceId: string, conversationId: string) {
    return this.getOrCreateContext(workspaceId).getOrCreateController(conversationId);
  }

  /**
   * Cancels the active run for a specific conversation.
   */
  cancelRun(workspaceId: string, conversationId: string): void {
    this.contexts.get(workspaceId)?.cancelConversation(conversationId);
  }

  /**
   * Cancels and removes the controller for a conversation (e.g. on conversation delete).
   */
  removeConversation(workspaceId: string, conversationId: string): void {
    this.contexts.get(workspaceId)?.removeController(conversationId);
  }

  /**
   * Forwards a user input token to the controller awaiting it.
   * Tokens are unique UUIDs — at most one controller across all workspaces will respond.
   */
  provideInputToActive(token: string, value: unknown): void {
    for (const context of this.contexts.values()) {
      context.forEachController((controller) => controller.provideUserInput(token, value));
    }
  }

  /**
   * Resolves a pending plan approval. Tokens are unique UUIDs — at most one controller responds.
   */
  approvePlan(token: string, approved: boolean): void {
    for (const context of this.contexts.values()) {
      context.forEachController((controller) => controller.approvePlan(token, approved));
    }
  }

  /**
   * Disposes all controllers and resources for a workspace (e.g. on workspace close).
   */
  remove(workspaceId: string): void {
    this.contexts.get(workspaceId)?.dispose();
    this.contexts.delete(workspaceId);
  }

  /**
   * Invalidates the skill manifest cache for all workspaces.
   * Called when notification-service broadcasts a skill.updated event.
   */
  invalidateAllSkillCaches(): void {
    for (const context of this.contexts.values()) {
      context.invalidateSkillCache();
    }
  }
}
