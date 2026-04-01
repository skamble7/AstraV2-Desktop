/**
 * SkillToToolConverter — converts a SkillDocument into an Anthropic SDK ToolDefinition.
 *
 * The tool name uses the sk.* identifier sanitised for Anthropic's naming rules
 * (dots replaced with double-underscore). The input schema is derived from
 * the skill's parameters_schema if present, or a permissive object schema otherwise.
 *
 * IMPORTANT: The actual MCP tool input schema is resolved at runtime via tools/list —
 * this conversion is for the planning phase where Claude selects which skills to use,
 * not for the invocation phase where exact schemas are needed.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SkillDocument, JSONSchema } from '../types/skill.types.js';

export class SkillToToolConverter {
  /**
   * Converts a SkillDocument to an Anthropic Tool definition for use in messages.stream().
   */
  convert(skill: SkillDocument): Anthropic.Tool {
    return {
      name: this.toToolName(skill.name),
      description: this.buildDescription(skill),
      input_schema: this.buildInputSchema(skill),
    };
  }

  /**
   * Converts a list of skills to Anthropic Tool definitions.
   */
  convertAll(skills: SkillDocument[]): Anthropic.Tool[] {
    return skills.map((skill) => this.convert(skill));
  }

  /**
   * Converts an Anthropic tool name back to a sk.* skill identifier.
   * Double-underscore is the delimiter used to replace dots.
   */
  toSkillName(toolName: string): string {
    return toolName.replace(/__/g, '.');
  }

  /**
   * Converts a sk.* skill identifier to a valid Anthropic tool name.
   * Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$.
   */
  toToolName(skillName: string): string {
    return skillName.replace(/\./g, '__');
  }

  private buildDescription(skill: SkillDocument): string {
    const lines: string[] = [skill.description];

    if (skill.produces_kinds.length > 0) {
      lines.push(`Produces: ${skill.produces_kinds.join(', ')}`);
    }

    if (skill.depends_on && skill.depends_on.length > 0) {
      lines.push(`Depends on: ${skill.depends_on.join(', ')}`);
    }

    if (skill.tags && skill.tags.length > 0) {
      lines.push(`Tags: ${skill.tags.join(', ')}`);
    }

    return lines.join('\n');
  }

  private buildInputSchema(skill: SkillDocument): Anthropic.Tool['input_schema'] {
    if (skill.parameters_schema) {
      return skill.parameters_schema as Anthropic.Tool['input_schema'];
    }

    // Default: permissive object schema — actual validation happens via tools/list at invocation time
    return {
      type: 'object' as const,
      properties: {} as Record<string, JSONSchema>,
      required: [],
    };
  }
}
