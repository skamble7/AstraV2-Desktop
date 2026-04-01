/**
 * InvokeSkillPackTool — the Anthropic tool definition for the invoke_skill_pack meta-tool.
 *
 * When Claude recognises that the user's intent maps exactly to a registered skill pack,
 * it invokes this tool instead of selecting skills individually. ExecutionCore then
 * switches to PackStrategy mid-run to fetch and execute the pack's playbook.
 */

import type Anthropic from '@anthropic-ai/sdk';

export const INVOKE_SKILL_PACK_TOOL_NAME = 'invoke_skill_pack';

export const INVOKE_SKILL_PACK_TOOL_DEFINITION: Anthropic.Tool = {
  name: INVOKE_SKILL_PACK_TOOL_NAME,
  description: [
    'Execute a named skill pack\'s playbook in full.',
    'Use this tool when the user\'s intent maps exactly to a registered skill pack.',
    'Prefer this over selecting individual skills when a matching pack exists —',
    'it executes the pack deterministically without additional LLM planning.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      pack_key: {
        type: 'string',
        description: 'The unique key of the skill pack to execute.',
      },
      pack_version: {
        type: 'string',
        description: 'The version of the skill pack. Defaults to latest published if omitted.',
      },
      inputs: {
        type: 'object',
        description: 'Top-level pack inputs as defined by the pack\'s pack_input_id schema.',
      },
    },
    required: ['pack_key'],
  },
};

export interface InvokeSkillPackInput {
  pack_key: string;
  pack_version?: string;
  inputs?: Record<string, unknown>;
}
