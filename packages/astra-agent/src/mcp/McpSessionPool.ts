/**
 * McpSessionPool — manages one @modelcontextprotocol/sdk Client per (sessionId, skillName) pair.
 *
 * MCP connections are expensive to establish. This pool lazily initialises a client
 * for each unique skill transport endpoint and reuses it within a session.
 * On session end, closeAll() terminates all connections.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpExecution } from '../types/skill.types.js';

type PoolKey = string;

export interface McpClientEntry {
  client: Client;
  transport: StreamableHTTPClientTransport | SSEClientTransport;
}

export class McpSessionPool {
  private readonly pool = new Map<PoolKey, McpClientEntry>();

  /**
   * Returns the MCP client for a given skill's execution config.
   * Creates and connects a new client if one does not exist for this session+skill.
   */
  async getOrCreate(
    sessionId: string,
    skillName: string,
    execution: McpExecution
  ): Promise<Client> {
    const key = this.buildKey(sessionId, skillName);

    const existing = this.pool.get(key);
    if (existing) {
      return existing.client;
    }

    const resolvedBaseUrl = this.resolveEnvVars(execution.base_url);
    const url = new URL(resolvedBaseUrl + execution.protocol_path);

    const headers = this.resolveHeaders(execution.headers);

    let transport: StreamableHTTPClientTransport | SSEClientTransport;
    if (execution.transport === 'sse') {
      transport = new SSEClientTransport(url, { requestInit: { headers } });
    } else {
      transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
    }

    const client = new Client(
      { name: 'astra-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    // Cast needed: exactOptionalPropertyTypes flags sessionId? mismatch between
    // StreamableHTTPClientTransport and the Transport interface — they are compatible at runtime.
    await client.connect(transport as Parameters<(typeof client)['connect']>[0]);

    this.pool.set(key, { client, transport });
    return client;
  }

  /**
   * Closes all MCP client connections and clears the pool.
   * Call this when a session ends or a run is cancelled.
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pool.values()).map(async (entry) => {
      try {
        await entry.client.close();
      } catch {
        // Ignore close errors — connection may already be terminated
      }
    });
    await Promise.allSettled(closePromises);
    this.pool.clear();
  }

  /**
   * Closes connections for a specific session only.
   */
  async closeSession(sessionId: string): Promise<void> {
    const keysToClose: PoolKey[] = [];

    for (const key of this.pool.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToClose.push(key);
      }
    }

    const closePromises = keysToClose.map(async (key) => {
      const entry = this.pool.get(key);
      if (entry) {
        try {
          await entry.client.close();
        } catch {
          // Ignore
        }
        this.pool.delete(key);
      }
    });

    await Promise.allSettled(closePromises);
  }

  private buildKey(sessionId: string, skillName: string): PoolKey {
    return `${sessionId}:${skillName}`;
  }

  /**
   * Replaces ${ENV_VAR} placeholders with process.env values.
   */
  private resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      return process.env[varName] ?? '';
    });
  }

  private resolveHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      resolved[key] = this.resolveEnvVars(value);
    }
    return resolved;
  }
}
