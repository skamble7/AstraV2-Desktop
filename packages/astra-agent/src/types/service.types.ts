/**
 * Response shapes for backend microservices.
 * These are the wire types — service clients map them to domain types as needed.
 */

// ─── Workspace Service (:8010) ───────────────────────────────────────────────

export interface WorkspaceResponse {
  id: string;
  name: string;
  domain_type: string;
  description?: string;
  status: string;
  artifact_count: number;
  run_count: number;
  conversation_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  domain_type: string;
  description?: string;
}

// ─── Skill Registry Service (:9028) ─────────────────────────────────────────

export interface SkillListResponse {
  skills: SkillSummary[];
  total: number;
}

export interface SkillSummary {
  name: string;
  version: string;
  description: string;
  produces_kinds: string[];
  status: string;
  tags?: string[];
}

export interface SkillPackListResponse {
  packs: SkillPackSummary[];
  total: number;
}

export interface SkillPackSummary {
  key: string;
  version: string;
  title: string;
  description: string;
  skill_count: number;
  status: string;
}

// ─── Conversation Service (:9029) ────────────────────────────────────────────

export interface ConversationDocument {
  conversation_id: string;
  workspace_id: string;
  /** Present only from GET /conversations/{id}/messages */
  messages?: unknown[];
  reasoning_trace?: unknown[];
  name?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationRequest {
  workspace_id: string;
  user_id?: string;
  name?: string;
}

export interface UpdateConversationRequest {
  messages?: unknown[];
  reasoning_trace?: unknown[];
  title?: string;
  name?: string;
}

// ─── Learning Service (:9022) ────────────────────────────────────────────────

export interface PlaybookRunResponse {
  run_id: string;
  workspace_id: string;
  session_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: RunStepResponse[];
  created_at: string;
  updated_at: string;
}

export interface RunStepResponse {
  step_id: string;
  skill_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  step_index: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface CreateRunRequest {
  workspace_id: string;
  session_id: string;
  skill_ids: string[];
}

// ─── Workspace Manager Service (:9027) ───────────────────────────────────────

export interface ArtifactResponse {
  id: string;
  workspace_id: string;
  kind: string;
  data: unknown;
  diagram?: string;
  narrative?: string;
  version: number;
  skill_name?: string;
  run_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertArtifactRequest {
  kind: string;
  data: unknown;
  diagram?: string;
  narrative?: string;
  skill_name?: string;
  run_id?: string;
}

// ─── Config Forge (:8040) ────────────────────────────────────────────────────

/**
 * Wire response from GET /config/resolve/:ref.
 *
 * The `data` block is provider-specific. `secret_refs` values use the format:
 *   "literal:<value>"   — inline literal value
 *   "${ENV_VAR}"        — resolved from process.env at runtime
 */
export interface LlmConfigData {
  provider: string;
  transport: string;
  model: string;
  temperature?: number;
  max_tokens: number;
  timeout_seconds?: number;
  /** Bedrock-specific */
  aws_region?: string;
  /** Credential references — resolved by LlmClientFactory */
  secret_refs?: Record<string, string>;
  provider_options?: Record<string, unknown>;
}

export interface LlmConfigResponse {
  _id: string;
  ref: string;
  env: string;
  kind: string;
  provider: string;
  data: LlmConfigData;
  created_at: string;
  updated_at: string;
}
