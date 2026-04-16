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

/**
 * Describes how to extract and store a file payload from a general skill's tool result.
 * Only present on skills with domain: 'general' that produce file output (Branch B).
 */
export interface RawArtifactEnvelope {
  /** Whether the tool result carries the file as a base64 string or a URL to fetch. */
  content_type: 'base64' | 'url';
  /** MIME type of the file, e.g. "application/pdf" or "text/csv". */
  mime_type: string;
  /** Filename template — supports {workspace_id}, {run_id}, {skill_name} substitutions. */
  filename_template: string;
}

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
  // Top-level fields present in the thin registry response:
  /** 'astra' → full 3-phase pipeline; 'general' → file upload or conversational result. */
  domain?: 'astra' | 'general';
  is_artifact_skill?: boolean;
  /** Defined only for domain:'general' skills that produce file output (Branch B). */
  raw_artifact_envelope?: RawArtifactEnvelope;
  skill_md_body?: string;
  // Fields that may or may not be present as top-level fields:
  execution?: SkillExecution;
  produces_kinds?: string[];
  depends_on?: string[];
  tags?: string[];
  status?: 'draft' | 'published' | 'deprecated';
  version?: string;
  parameters_schema?: JSONSchema;
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
  name?: string;
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
