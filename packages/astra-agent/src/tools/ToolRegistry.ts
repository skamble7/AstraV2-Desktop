/**
 * ToolRegistry — builds the complete list of Anthropic Tool definitions for IntentStrategy.
 *
 * The tool list is the combination of:
 * 1. All published skills (sk.* → Anthropic Tool via SkillToToolConverter)
 * 2. Meta-tools: invoke_skill_pack and ask_user
 *
 * Skill tools allow Claude to select and sequence individual skills.
 * Meta-tools give Claude higher-level capabilities.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SkillDocument } from '../types/skill.types.js';
import type { SkillToToolConverter } from '../skills/SkillToToolConverter.js';
import { ASK_USER_TOOL_DEFINITION } from './AskUserTool.js';
import { INVOKE_SKILL_PACK_TOOL_DEFINITION } from './InvokeSkillPackTool.js';

export class ToolRegistry {
  private readonly converter: SkillToToolConverter;

  constructor(converter: SkillToToolConverter) {
    this.converter = converter;
  }

  /**
   * Builds the full tool list: skill tools + meta-tools.
   */
  buildToolList(skills: SkillDocument[]): Anthropic.Tool[] {
    const skillTools = this.converter.convertAll(skills);
    return [...skillTools, INVOKE_SKILL_PACK_TOOL_DEFINITION, ASK_USER_TOOL_DEFINITION];
  }
}
