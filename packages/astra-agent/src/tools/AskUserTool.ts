/**
 * AskUserTool — the Anthropic tool definition for the ask_user meta-tool.
 *
 * When Claude invokes this tool, execution suspends. The AgentController stores
 * a Promise resolver keyed by token. Execution resumes when the renderer
 * calls provideUserInput() with the matching token.
 */

import type Anthropic from '@anthropic-ai/sdk';

export const ASK_USER_TOOL_NAME = 'ask_user';

export const ASK_USER_TOOL_DEFINITION: Anthropic.Tool = {
  name: ASK_USER_TOOL_NAME,
  description: [
    'Suspend execution and ask the user a question.',
    'Use this tool when required inputs are missing or the intent is ambiguous.',
    'The user will reply in the chat interface — do not use this for optional information.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to present to the user.',
      },
      input_type: {
        type: 'string',
        enum: ['text', 'url', 'file_path', 'select'],
        description: 'The type of input expected from the user.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Options to present when input_type is "select".',
      },
    },
    required: ['question', 'input_type'],
  },
};

export interface AskUserInput {
  question: string;
  input_type: 'text' | 'url' | 'file_path' | 'select';
  options?: string[];
}
