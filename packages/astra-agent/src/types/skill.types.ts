/**
 * Types for Skills and Skill Packs — the sk.* execution primitives.
 * Skills invoke exactly one MCP tool or one LLM call.
 * Skill Packs bundle ordered skills into purpose-driven playbooks.
 */

export interface McpExecution {
  mode: 'mcp';
  transport: 'http' | 'sse';
  base_url: string;
  protocol_path: string;
  tool_name: string;
  timeout_sec: number;
  verify_tls: boolean;
  retry?: RetryConfig;
  headers?: Record<string, string>;
  auth?: AuthConfig;
}

export interface LlmExecution {
  mode: 'llm';
  config_ref: string;
}

export type SkillExecution = McpExecution | LlmExecution;

export interface RetryConfig {
  max_attempts: number;
  backoff_ms: number;
  jitter_ms: number;
}

export interface AuthConfig {
  type: 'bearer' | 'api_key' | 'basic';
  alias_token: string;
}

export interface SkillDocument {
  name: string;
  description: string;
  execution: SkillExecution;
  produces_kinds: string[];
  depends_on?: string[];
  tags?: string[];
  status: 'draft' | 'published' | 'deprecated';
  version: string;
  parameters_schema?: JSONSchema;
  skill_md_body: string;
  references?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface PlaybookStep {
  skill_id: string;
}

export interface Playbook {
  steps: PlaybookStep[];
}

export interface SkillPackDocument {
  key: string;
  version: string;
  title: string;
  description: string;
  skill_ids: string[];
  agent_skill_ids?: string[];
  pack_input_id?: string;
  playbook: Playbook;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface StagedArtifact {
  kind: string;
  data: unknown;
  diagram?: string;
  narrative?: string;
  skill_name: string;
  step_index: number;
}

/**
 * Minimal JSON Schema subset used for parameter_schema fields.
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
}
