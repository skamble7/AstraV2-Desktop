/**
 * Core agent runtime types: context, configuration, and cancellation.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SessionClient } from '../http/clients/SessionClient.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import type { WorkspaceManagerClient } from '../http/clients/WorkspaceManagerClient.js';
import type { ConfigForgeClient } from '../http/clients/ConfigForgeClient.js';
import type { ArtifactRegistryClient } from '../http/clients/ArtifactRegistryClient.js';
import type { LlmClientFactory } from '../http/clients/LlmClientFactory.js';
import type { SkillManifestCache } from '../skills/SkillManifestCache.js';
import type { SkillResolver } from '../skills/SkillResolver.js';
import type { SkillToToolConverter } from '../skills/SkillToToolConverter.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { ArtifactPersister } from '../persistence/ArtifactPersister.js';

export type RunMode = 'intent' | 'pack';

/**
 * Minimal interface that both `Anthropic` and `AnthropicBedrock` satisfy.
 * Defined in terms of the specific methods the agent actually calls so that
 * private implementation details (e.g. _client type) do not cause assignment errors.
 */
export interface AnthropicClient {
  messages: Pick<Anthropic['messages'], 'create' | 'stream'>;
}

/**
 * Passed to strategies and execution phases — contains all runtime context needed
 * to execute a run without reaching into global state.
 */
export interface AgentRunContext {
  workspace_id: string;
  session_id: string;
  run_id: string;
  mode: RunMode;
  /**
   * For intent runs: the user's natural language intent.
   */
  intent?: string;
  /**
   * For pack runs: the pack key and optional version.
   */
  pack_key?: string;
  pack_version?: string;
  /**
   * For pack runs: top-level inputs supplied by the renderer.
   */
  pack_inputs?: Record<string, unknown>;
  /**
   * LLM client resolved from config-forge. Both Anthropic and AnthropicBedrock satisfy this type.
   */
  anthropic: AnthropicClient;
  /**
   * Model ID to use for all LLM calls in this run (planner, narrative, repair).
   * Derived from the resolved config-forge LLM config — never hardcoded.
   */
  plannerModel: string;
  /**
   * AbortSignal threaded through all async operations for graceful cancellation.
   */
  signal: AbortSignal;
  /**
   * Conversation history loaded from session service at the start of each turn.
   * Prepended before the user message in IntentStrategy.
   */
  conversationHistory?: Anthropic.MessageParam[];
}

/**
 * Configuration injected into AgentController at construction time.
 * No secrets are stored in the renderer or state — they live here in main process.
 * Credentials are resolved at run time from config-forge.
 */
export interface AgentServiceConfig {
  skillRegistryBaseUrl: string;
  sessionServiceBaseUrl: string;
  workspaceManagerBaseUrl: string;
  configForgeBaseUrl: string;
  artifactServiceBaseUrl: string;
  notificationServiceWsUrl: string;
  /**
   * Config-forge ref key for the LLM config used by the planner and all agent LLM calls.
   * Example: "dev.llm.bedrock.explicit-creds"
   */
  plannerConfigRef: string;
}

/**
 * Workspace-level shared resources created once per workspace and injected into
 * every AgentController for that workspace. All fields are stateless or safely
 * shared across concurrent conversations (e.g. HTTP clients, caches).
 *
 * Streamer and RawArtifactUploader are NOT included — they are per-conversation
 * because Streamer is the event bus for a single run.
 */
export interface WorkspaceResources {
  workspaceId: string;
  sessionClient: SessionClient;
  skillRegistryClient: SkillRegistryClient;
  workspaceManagerClient: WorkspaceManagerClient;
  configForgeClient: ConfigForgeClient;
  artifactRegistryClient: ArtifactRegistryClient;
  llmClientFactory: LlmClientFactory;
  skillManifestCache: SkillManifestCache;
  skillResolver: SkillResolver;
  skillToToolConverter: SkillToToolConverter;
  toolRegistry: ToolRegistry;
  artifactPersister: ArtifactPersister;
}

/**
 * The resolver function stored in AgentController for ask_user suspension.
 * Called when the renderer provides user input via provideUserInput().
 */
export type UserInputResolver = (value: unknown) => void;

/**
 * Message stored in session history — matches Anthropic SDK message format.
 */
export type SessionMessage = Anthropic.MessageParam;
