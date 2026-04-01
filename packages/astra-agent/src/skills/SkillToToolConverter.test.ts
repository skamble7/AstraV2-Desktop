import { describe, it, expect } from 'vitest';
import { SkillToToolConverter } from './SkillToToolConverter.js';
import type { SkillDocument } from '../types/skill.types.js';

function makeSkill(overrides: Partial<SkillDocument> = {}): SkillDocument {
  return {
    name: 'sk.agile.generate_user_story',
    description: 'Generates a user story artifact',
    execution: { mode: 'mcp', transport: 'http', base_url: 'http://localhost:9028', protocol_path: '/mcp', tool_name: 'generate_user_story', timeout_sec: 30, verify_tls: false },
    produces_kinds: ['cam.agile.user_story'],
    status: 'published',
    version: '1.0.0',
    skill_md_body: '# Generate User Story',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('SkillToToolConverter', () => {
  const converter = new SkillToToolConverter();

  describe('toToolName', () => {
    it('replaces dots with double underscore', () => {
      expect(converter.toToolName('sk.agile.generate_user_story')).toBe('sk__agile__generate_user_story');
    });

    it('handles single-segment names', () => {
      expect(converter.toToolName('sk')).toBe('sk');
    });
  });

  describe('toSkillName', () => {
    it('replaces double underscores with dots', () => {
      expect(converter.toSkillName('sk__agile__generate_user_story')).toBe('sk.agile.generate_user_story');
    });

    it('is the inverse of toToolName', () => {
      const original = 'sk.data.fetch_context';
      expect(converter.toSkillName(converter.toToolName(original))).toBe(original);
    });
  });

  describe('convert', () => {
    it('sets the tool name using dots→double-underscore conversion', () => {
      const skill = makeSkill({ name: 'sk.agile.generate_user_story' });
      const tool = converter.convert(skill);
      expect(tool.name).toBe('sk__agile__generate_user_story');
    });

    it('includes description in tool description', () => {
      const skill = makeSkill({ description: 'Creates a user story' });
      const tool = converter.convert(skill);
      expect(tool.description).toContain('Creates a user story');
    });

    it('includes produces_kinds in description', () => {
      const skill = makeSkill({ produces_kinds: ['cam.agile.user_story', 'cam.agile.epic'] });
      const tool = converter.convert(skill);
      expect(tool.description).toContain('cam.agile.user_story');
      expect(tool.description).toContain('cam.agile.epic');
    });

    it('includes depends_on in description when present', () => {
      const skill = makeSkill({ depends_on: ['sk.data.fetch_context'] });
      const tool = converter.convert(skill);
      expect(tool.description).toContain('sk.data.fetch_context');
    });

    it('uses skill parameters_schema when provided', () => {
      const schema = {
        type: 'object' as const,
        properties: { workspace_id: { type: 'string' } },
        required: ['workspace_id'],
      };
      const skill = makeSkill({ parameters_schema: schema });
      const tool = converter.convert(skill);
      expect(tool.input_schema).toEqual(schema);
    });

    it('falls back to permissive schema when parameters_schema is absent', () => {
      const { parameters_schema: _omitted, ...rest } = makeSkill();
      const skill = rest as import('../types/skill.types.js').SkillDocument;
      const tool = converter.convert(skill);
      expect(tool.input_schema.type).toBe('object');
    });
  });

  describe('convertAll', () => {
    it('converts every skill in the list', () => {
      const skills = [
        makeSkill({ name: 'sk.agile.alpha' }),
        makeSkill({ name: 'sk.agile.beta' }),
      ];
      const tools = converter.convertAll(skills);
      expect(tools).toHaveLength(2);
      expect(tools[0]!.name).toBe('sk__agile__alpha');
      expect(tools[1]!.name).toBe('sk__agile__beta');
    });

    it('returns empty array for empty skill list', () => {
      expect(converter.convertAll([])).toEqual([]);
    });
  });
});
