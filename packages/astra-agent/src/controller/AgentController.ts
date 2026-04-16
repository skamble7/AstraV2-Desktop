/**
 * AgentController — the public entry point of the astra-agent library.
 *
 * Responsibilities:
 * - Receive intent or skill pack selection (from Electron IPC handlers)
 * - Select and execute the appropriate strategy (Intent or Pack)
 * - Manage per-run AbortController for independent cancellation
 * - Handle ask_user suspension/resumption via a Promise resolver map
 * - Stream all events to the Electron main process via Streamer
 *
 * One AgentController per workspace. AgentRegistry in main process holds
 * Map<workspaceId, AgentController>.
 *
 * All dependencies are injected — no global state, fully testable.
 * Credentials are resolved at run time from config-forge — no API keys at construction.
 */

import { randomUUID } from 'node:crypto';
import { Streamer } from '../streaming/Streamer.js';
import { SkillManifestCache } from '../skills/SkillManifestCache.js';
import { SkillResolver } from '../skills/SkillResolver.js';
import { SkillToToolConverter } from '../skills/SkillToToolConverter.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { McpSessionPool } from '../mcp/McpSessionPool.js';
import { McpInvoker } from '../invokers/McpInvoker.js';
import { LlmInvoker } from '../invokers/LlmInvoker.js';
import { DiscoverPhase } from '../execution/phases/DiscoverPhase.js';
import { DiagramPhase } from '../execution/phases/DiagramPhase.js';
import { NarrativePhase } from '../execution/phases/NarrativePhase.js';
import { ArtifactPersister } from '../persistence/ArtifactPersister.js';
import { RawArtifactUploader } from '../persistence/RawArtifactUploader.js';
import { RunRecorder } from '../persistence/RunRecorder.js';
import { ExecutionCore } from '../execution/ExecutionCore.js';
import { IntentStrategy } from '../strategies/IntentStrategy.js';
import { PackStrategy } from '../strategies/PackStrategy.js';
import { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import { WorkspaceManagerClient } from '../http/clients/WorkspaceManagerClient.js';
import { ConfigForgeClient } from '../http/clients/ConfigForgeClient.js';
import { ArtifactRegistryClient } from '../http/clients/ArtifactRegistryClient.js';
import { LlmClientFactory } from '../http/clients/LlmClientFactory.js';
import { SessionClient } from '../http/clients/SessionClient.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentServiceConfig, UserInputResolver } from '../types/agent.types.js';
import type { AgentEvent } from '../types/stream.types.js';

export class AgentController {
  private readonly workspaceId: string;

  // Shared across runs — these hold session-level state
  private readonly streamer: Streamer;
  private readonly sessionClient: SessionClient;
  private readonly skillRegistryClient: SkillRegistryClient;
  private readonly artifactPersister: ArtifactPersister;
  private readonly rawArtifactUploader: RawArtifactUploader;
  private readonly configForgeClient: ConfigForgeClient;
  private readonly artifactRegistryClient: ArtifactRegistryClient;
  private readonly llmClientFactory: LlmClientFactory;
  private readonly skillManifestCache: SkillManifestCache;
  private readonly skillResolver: SkillResolver;
  private readonly skillToToolConverter: SkillToToolConverter;
  private readonly toolRegistry: ToolRegistry;

  /**
   * ask_user suspension: token → resolver. Populated by IntentStrategy, resolved here.
   */
  private readonly userInputResolvers: Map<string, UserInputResolver> = new Map();

  /**
   * Plan approval suspension: token → resolver. Populated by startIntentRun, resolved here.
   */
  private readonly planApprovalResolvers: Map<string, (approved: boolean) => void> = new Map();

  /**
   * Per-run AbortController. Reset on each new run start.
   */
  private abortController: AbortController | null = null;

  constructor(workspaceId: string, config: AgentServiceConfig) {
    this.workspaceId = workspaceId;

    this.streamer = new Streamer();

    this.sessionClient = new SessionClient({ baseUrl: config.sessionServiceBaseUrl });

    this.skillRegistryClient = new SkillRegistryClient({
      baseUrl: config.skillRegistryBaseUrl,
    });

    const workspaceManagerClient = new WorkspaceManagerClient({
      baseUrl: config.workspaceManagerBaseUrl,
    });
    this.artifactPersister = new ArtifactPersister(workspaceManagerClient);
    this.rawArtifactUploader = new RawArtifactUploader(workspaceManagerClient, this.streamer);

    this.configForgeClient = new ConfigForgeClient({ baseUrl: config.configForgeBaseUrl });
    this.artifactRegistryClient = new ArtifactRegistryClient({ baseUrl: config.artifactServiceBaseUrl });

    // LlmClientFactory resolves credentials from config-forge at run time — no API key needed at construction.
    this.llmClientFactory = new LlmClientFactory(this.configForgeClient, config.plannerConfigRef);

    this.skillManifestCache = new SkillManifestCache(this.skillRegistryClient);
    this.skillResolver = new SkillResolver(this.skillManifestCache, this.skillRegistryClient);
    this.skillToToolConverter = new SkillToToolConverter();
    this.toolRegistry = new ToolRegistry(this.skillToToolConverter);
  }

  /**
   * Subscribe to all agent events. Returns an unsubscribe function.
   * The Electron StreamBridge calls this to forward events over IPC.
   */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.streamer.onAgentEvent(listener);
  }

  /**
   * Loads conversation history from session service. Returns [] on any error so the
   * agent always starts rather than failing due to a missing or unavailable session.
   */
  private async loadSessionHistory(
    sessionId: string,
    signal: AbortSignal
  ): Promise<Anthropic.MessageParam[]> {
    try {
      const session = await this.sessionClient.getSession(sessionId, signal);
      return (session.messages ?? []) as Anthropic.MessageParam[];
    } catch {
      return [];
    }
  }

  /**
   * Persists conversation history to session service after each turn.
   * Best-effort — swallows errors so history failure never breaks a run.
   */
  private async saveSessionHistory(
    sessionId: string,
    messages: Anthropic.MessageParam[],
    signal: AbortSignal
  ): Promise<void> {
    try {
      await this.sessionClient.updateSession(sessionId, { messages }, signal);
    } catch {
      // Best-effort — never let a history save failure break a conversation turn.
    }
  }

  /**
   * Starts an intent-driven run. The user's natural language intent is handed
   * to IntentStrategy which uses Claude to plan and execute the skill sequence.
   */
  async startIntentRun(intent: string, sessionId: string): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let mcpSessionPool: McpSessionPool | null = null;

    try {
      const { client: anthropic, model: plannerModel } = await this.llmClientFactory.resolve(signal);
      const conversationHistory = await this.loadSessionHistory(sessionId, signal);

      const runContext = {
        workspace_id: this.workspaceId,
        session_id: sessionId,
        run_id: randomUUID(),
        mode: 'intent' as const,
        intent,
        anthropic,
        plannerModel,
        signal,
        conversationHistory,
      };

      mcpSessionPool = new McpSessionPool();
      const mcpInvoker = new McpInvoker(mcpSessionPool, anthropic, sessionId, this.workspaceId, plannerModel, intent);
      const llmInvoker = new LlmInvoker(anthropic, this.configForgeClient, plannerModel, this.artifactRegistryClient);

      const discoverPhase = new DiscoverPhase(mcpInvoker, llmInvoker);
      const diagramPhase = new DiagramPhase(mcpInvoker);
      const narrativePhase = new NarrativePhase(anthropic, this.streamer, plannerModel);
      const runRecorder = new RunRecorder();

      const executionCore = new ExecutionCore({
        skillResolver: this.skillResolver,
        stepRunnerDeps: {
          discoverPhase,
          diagramPhase,
          narrativePhase,
          artifactPersister: this.artifactPersister,
          rawArtifactUploader: this.rawArtifactUploader,
          runRecorder,
          streamer: this.streamer,
          anthropic,
          plannerModel,
        },
        runRecorder,
        streamer: this.streamer,
      });

      const intentStrategy = new IntentStrategy(
        this.skillResolver,
        this.skillToToolConverter,
        this.toolRegistry,
        this.streamer,
        this.skillRegistryClient,
        this.userInputResolvers
      );

      const plan = await intentStrategy.plan(runContext);

      // Persist the updated conversation history (user message + assistant response).
      if (plan.updatedMessages) {
        await this.saveSessionHistory(sessionId, plan.updatedMessages, signal);
      }

      if (plan.steps.length === 0) {
        // Claude answered conversationally — no skills to execute.
        // Publish run:completed so the renderer finalizes the streaming message.
        this.streamer.publish({ type: 'run:completed', run_id: runContext.run_id });
      } else {
        // Suspend until the user approves the plan.
        const approved = await this.awaitPlanApproval(plan.steps, signal);
        if (!approved) {
          this.streamer.publish({ type: 'run:cancelled' });
          return;
        }
        await executionCore.execute(plan, this.workspaceId, signal);
      }
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[AgentController] startIntentRun failed:', error);
        this.streamer.publish({ type: 'run:failed', error: message });
      }
    } finally {
      if (mcpSessionPool) {
        await mcpSessionPool.closeSession(sessionId);
      }
    }
  }

  /**
   * Starts a pack-driven run. The pack playbook is read deterministically — no LLM planning.
   */
  async startPackRun(
    packKey: string,
    packVersion: string,
    inputs: Record<string, unknown>,
    sessionId: string
  ): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const { client: anthropic, model: plannerModel } = await this.llmClientFactory.resolve(signal);

    const runContext = {
      workspace_id: this.workspaceId,
      session_id: sessionId,
      run_id: randomUUID(),
      mode: 'pack' as const,
      pack_key: packKey,
      pack_version: packVersion,
      pack_inputs: inputs,
      anthropic,
      plannerModel,
      signal,
    };

    const mcpSessionPool = new McpSessionPool();
    const mcpInvoker = new McpInvoker(mcpSessionPool, anthropic, sessionId, this.workspaceId, plannerModel);
    const llmInvoker = new LlmInvoker(anthropic, this.configForgeClient, plannerModel, this.artifactRegistryClient);

    const discoverPhase = new DiscoverPhase(mcpInvoker, llmInvoker);
    const diagramPhase = new DiagramPhase(mcpInvoker);
    const narrativePhase = new NarrativePhase(anthropic, this.streamer, plannerModel);
    const runRecorder = new RunRecorder();

    const executionCore = new ExecutionCore({
      skillResolver: this.skillResolver,
      stepRunnerDeps: {
        discoverPhase,
        diagramPhase,
        narrativePhase,
        artifactPersister: this.artifactPersister,
        rawArtifactUploader: this.rawArtifactUploader,
        runRecorder,
        streamer: this.streamer,
        anthropic,
        plannerModel,
      },
      runRecorder,
      streamer: this.streamer,
    });

    const packStrategy = new PackStrategy(this.skillRegistryClient);

    try {
      const plan = await packStrategy.plan(runContext);
      await executionCore.execute(plan, this.workspaceId, signal);
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.streamer.publish({ type: 'run:failed', error: message });
      }
    } finally {
      await mcpSessionPool.closeSession(sessionId);
    }
  }

  /**
   * Cancels the currently active run for this workspace.
   * Has no effect if no run is in progress.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Resolves a pending ask_user suspension.
   * Called when the renderer submits user input via IPC.
   */
  provideUserInput(token: string, value: unknown): void {
    const resolver = this.userInputResolvers.get(token);
    if (resolver) {
      this.userInputResolvers.delete(token);
      resolver(value);
    }
  }

  /**
   * Suspends execution until the user approves or rejects the plan.
   * Emits plan:awaiting_approval so the renderer can show the approval UI.
   * Returns true if approved, false if rejected or aborted.
   */
  private awaitPlanApproval(
    steps: import('../types/plan.types.js').PlanStep[],
    signal: AbortSignal
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const token = randomUUID();
      this.planApprovalResolvers.set(token, resolve);

      this.streamer.publish({ type: 'plan:awaiting_approval', token, steps });

      signal.addEventListener(
        'abort',
        () => {
          this.planApprovalResolvers.delete(token);
          resolve(false);
        },
        { once: true }
      );
    });
  }

  /**
   * Resolves a pending plan approval suspension.
   * Called when the renderer clicks Approve or Cancel via IPC.
   */
  approvePlan(token: string, approved: boolean): void {
    const resolver = this.planApprovalResolvers.get(token);
    if (resolver) {
      this.planApprovalResolvers.delete(token);
      resolver(approved);
    }
  }

  /**
   * Invalidates the skill manifest cache.
   * Call this when notification-service emits a skill.updated or skill.created event.
   */
  invalidateSkillCache(): void {
    this.skillManifestCache.invalidate();
  }
}
