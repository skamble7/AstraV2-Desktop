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
import { RunRecorder } from '../persistence/RunRecorder.js';
import { ExecutionCore } from '../execution/ExecutionCore.js';
import { IntentStrategy } from '../strategies/IntentStrategy.js';
import { PackStrategy } from '../strategies/PackStrategy.js';
import { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import { WorkspaceManagerClient } from '../http/clients/WorkspaceManagerClient.js';
import { LearningClient } from '../http/clients/LearningClient.js';
import { ConfigForgeClient } from '../http/clients/ConfigForgeClient.js';
import { LlmClientFactory } from '../http/clients/LlmClientFactory.js';
import type { AgentServiceConfig, UserInputResolver } from '../types/agent.types.js';
import type { AgentEvent } from '../types/stream.types.js';

export class AgentController {
  private readonly workspaceId: string;

  // Shared across runs — these hold session-level state
  private readonly streamer: Streamer;
  private readonly skillRegistryClient: SkillRegistryClient;
  private readonly artifactPersister: ArtifactPersister;
  private readonly learningClient: LearningClient;
  private readonly configForgeClient: ConfigForgeClient;
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
   * Per-run AbortController. Reset on each new run start.
   */
  private abortController: AbortController | null = null;

  constructor(workspaceId: string, config: AgentServiceConfig) {
    this.workspaceId = workspaceId;

    this.streamer = new Streamer();

    this.skillRegistryClient = new SkillRegistryClient({
      baseUrl: config.skillRegistryBaseUrl,
    });

    const workspaceManagerClient = new WorkspaceManagerClient({
      baseUrl: config.workspaceManagerBaseUrl,
    });
    this.artifactPersister = new ArtifactPersister(workspaceManagerClient);

    this.learningClient = new LearningClient({ baseUrl: config.learningServiceBaseUrl });
    this.configForgeClient = new ConfigForgeClient({ baseUrl: config.configForgeBaseUrl });

    // LlmClientFactory resolves credentials from config-forge at run time — no API key needed at construction.
    this.llmClientFactory = new LlmClientFactory(this.configForgeClient, config.plannerConfigRef);

    this.skillManifestCache = new SkillManifestCache(this.skillRegistryClient);
    this.skillResolver = new SkillResolver(this.skillManifestCache);
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
   * Starts an intent-driven run. The user's natural language intent is handed
   * to IntentStrategy which uses Claude to plan and execute the skill sequence.
   */
  async startIntentRun(intent: string, sessionId: string): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const { client: anthropic, model: plannerModel } = await this.llmClientFactory.resolve(signal);

    const runContext = {
      workspace_id: this.workspaceId,
      session_id: sessionId,
      run_id: randomUUID(),
      mode: 'intent' as const,
      intent,
      anthropic,
      plannerModel,
      signal,
    };

    const mcpSessionPool = new McpSessionPool();
    const mcpInvoker = new McpInvoker(mcpSessionPool, anthropic, sessionId, plannerModel);
    const llmInvoker = new LlmInvoker(anthropic, this.configForgeClient);

    const discoverPhase = new DiscoverPhase(mcpInvoker, llmInvoker);
    const diagramPhase = new DiagramPhase(mcpInvoker, this.streamer);
    const narrativePhase = new NarrativePhase(anthropic, this.streamer, plannerModel);
    const runRecorder = new RunRecorder(this.learningClient);

    const executionCore = new ExecutionCore({
      skillResolver: this.skillResolver,
      stepRunnerDeps: {
        discoverPhase,
        diagramPhase,
        narrativePhase,
        artifactPersister: this.artifactPersister,
        runRecorder,
        streamer: this.streamer,
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

    try {
      const plan = await intentStrategy.plan(runContext);
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
    const mcpInvoker = new McpInvoker(mcpSessionPool, anthropic, sessionId, plannerModel);
    const llmInvoker = new LlmInvoker(anthropic, this.configForgeClient);

    const discoverPhase = new DiscoverPhase(mcpInvoker, llmInvoker);
    const diagramPhase = new DiagramPhase(mcpInvoker, this.streamer);
    const narrativePhase = new NarrativePhase(anthropic, this.streamer, plannerModel);
    const runRecorder = new RunRecorder(this.learningClient);

    const executionCore = new ExecutionCore({
      skillResolver: this.skillResolver,
      stepRunnerDeps: {
        discoverPhase,
        diagramPhase,
        narrativePhase,
        artifactPersister: this.artifactPersister,
        runRecorder,
        streamer: this.streamer,
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
   * Invalidates the skill manifest cache.
   * Call this when notification-service emits a skill.updated or skill.created event.
   */
  invalidateSkillCache(): void {
    this.skillManifestCache.invalidate();
  }
}
