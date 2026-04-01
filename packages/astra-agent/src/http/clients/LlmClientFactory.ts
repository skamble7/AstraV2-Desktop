/**
 * LlmClientFactory — resolves an LLM config ref from config-forge and creates
 * the appropriate Anthropic client (direct API or AWS Bedrock).
 *
 * Secret refs in the config use two formats:
 *   "literal:<value>"   — the value is used as-is after stripping the prefix
 *   "${ENV_VAR_NAME}"   — the value is read from process.env at resolve time
 *
 * The resolved client is cached after the first successful fetch so that
 * config-forge is only called once per AgentController lifetime.
 */

import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';
import type { ConfigForgeClient } from './ConfigForgeClient.js';
import type { AnthropicClient } from '../../types/agent.types.js';

export interface ResolvedLlmClient {
  /** LLM client compatible with both Anthropic and AnthropicBedrock call sites. */
  client: AnthropicClient;
  /** Model ID to use for all LLM calls in this run (planner, narrative, repair). */
  model: string;
  maxTokens: number;
}

export class LlmClientFactory {
  private readonly configForgeClient: ConfigForgeClient;
  private readonly configRef: string;
  /** Cache — resolved once per factory lifetime (one AgentController). */
  private resolved: ResolvedLlmClient | null = null;

  constructor(configForgeClient: ConfigForgeClient, configRef: string) {
    this.configForgeClient = configForgeClient;
    this.configRef = configRef;
  }

  /**
   * Returns a resolved LLM client. Fetches from config-forge on first call;
   * returns the cached result on subsequent calls.
   *
   * Call `invalidate()` to force a re-fetch (e.g. after credential rotation).
   */
  async resolve(signal?: AbortSignal): Promise<ResolvedLlmClient> {
    if (this.resolved) {
      return this.resolved;
    }

    const config = await this.configForgeClient.getLlmConfig(this.configRef, signal);
    const { data } = config;

    let client: AnthropicClient;

    if (data.provider === 'bedrock') {
      const secretRefs = data.secret_refs ?? {};
      const accessKey = this.resolveSecretRef(secretRefs['access_key'] ?? '');
      const secretKey = this.resolveSecretRef(secretRefs['secret_key'] ?? '');

      // Cast via unknown: AnthropicBedrock.messages uses a slightly different RequestOptions
      // generic than @anthropic-ai/sdk — the runtime interface is identical.
      client = new AnthropicBedrock({
        awsAccessKey: accessKey,
        awsSecretKey: secretKey,
        ...(data.aws_region !== undefined ? { awsRegion: data.aws_region } : {}),
      }) as unknown as AnthropicClient;
    } else {
      // Direct Anthropic API — expects access_key to hold the API key
      const secretRefs = data.secret_refs ?? {};
      const apiKey = this.resolveSecretRef(secretRefs['api_key'] ?? secretRefs['access_key'] ?? '');
      client = new Anthropic({ apiKey });
    }

    this.resolved = {
      client,
      model: data.model,
      maxTokens: data.max_tokens,
    };

    return this.resolved;
  }

  /** Forces the next call to `resolve()` to re-fetch from config-forge. */
  invalidate(): void {
    this.resolved = null;
  }

  /**
   * Resolves a secret_ref string to its actual value.
   *
   * Supported formats:
   *   "literal:<value>"   → returns "<value>"
   *   "${VAR_NAME}"       → returns process.env["VAR_NAME"] ?? ""
   *   "<raw>"             → returned as-is (treated as a literal)
   */
  private resolveSecretRef(ref: string): string {
    if (ref.startsWith('literal:')) {
      return ref.slice('literal:'.length);
    }

    const envVarMatch = /^\$\{([^}]+)\}$/.exec(ref);
    if (envVarMatch) {
      const varName = envVarMatch[1]!;
      return process.env[varName] ?? '';
    }

    return ref;
  }
}
