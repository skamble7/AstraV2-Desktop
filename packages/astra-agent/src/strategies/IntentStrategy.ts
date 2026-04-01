/**
 * IntentStrategy — LLM-based planning strategy.
 *
 * Flow:
 * 1. Load full published skill manifest from SkillManifestCache
 * 2. Convert each skill to Anthropic tool definition via SkillToToolConverter
 * 3. Add meta-tools: invoke_skill_pack, ask_user
 * 4. Call anthropic.messages.stream() with full conversation history, system prompt, tools
 * 5. Collect tool_use blocks into ordered PlanSteps — emit plan:step_added progressively
 * 6. Handle ask_user tool_use by emitting agent:ask_user event and suspending
 * 7. Handle invoke_skill_pack by switching to PackStrategy mid-run
 * 8. Return the assembled Plan
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { IStrategy } from './IStrategy.js';
import type { Plan, PlanStep } from '../types/plan.types.js';
import type { AgentRunContext, UserInputResolver } from '../types/agent.types.js';
import type { SkillResolver } from '../skills/SkillResolver.js';
import type { SkillToToolConverter } from '../skills/SkillToToolConverter.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { Streamer } from '../streaming/Streamer.js';
import type { SkillRegistryClient } from '../http/clients/SkillRegistryClient.js';
import {
  ASK_USER_TOOL_NAME,
  type AskUserInput,
} from '../tools/AskUserTool.js';
import {
  INVOKE_SKILL_PACK_TOOL_NAME,
  type InvokeSkillPackInput,
} from '../tools/InvokeSkillPackTool.js';
import { PackStrategy } from './PackStrategy.js';
import { randomUUID } from 'node:crypto';

const SYSTEM_PROMPT = `You are the Astra Agent — an intelligent orchestrator for a knowledge-generation platform.
Your role is to understand the user's intent and invoke the right sequence of skills.

SKILLS
You have access to a set of registered skills (sk.* tools). Each skill:
- Executes exactly one MCP tool and produces one family of artifact kinds
- Has a detailed description explaining WHEN to use it, not just what it does
- May depend on artifacts produced by earlier skills

PLANNING BEHAVIOUR
- Think step by step about what the user wants to produce
- Select only the skills needed — do not invoke skills that are not required
- Respect dependency order: never invoke a skill before its depends_on skills have run
- If inputs are missing, use ask_user to request them before invoking skills
- If you would invoke the same skill pack as a whole, use invoke_skill_pack instead

EXECUTION BEHAVIOUR
- Invoke skills one at a time; wait for each to complete before proceeding
- After each skill, describe briefly what was produced and whether it succeeded
- If a skill fails, explain why and suggest whether to retry or stop

CONSTRAINTS
- Never guess MCP tool input schemas — they are resolved at runtime
- Never hallucinate artifact content — you orchestrate, you do not generate
- Current workspace: {workspaceId}
- Current session: {sessionId}`;

export class IntentStrategy implements IStrategy {
  private readonly skillResolver: SkillResolver;
  private readonly skillToToolConverter: SkillToToolConverter;
  private readonly toolRegistry: ToolRegistry;
  private readonly streamer: Streamer;
  private readonly skillRegistryClient: SkillRegistryClient;
  /**
   * Shared ask_user resolver map — owned by AgentController, passed here by reference.
   */
  private readonly userInputResolvers: Map<string, UserInputResolver>;

  constructor(
    skillResolver: SkillResolver,
    skillToToolConverter: SkillToToolConverter,
    toolRegistry: ToolRegistry,
    streamer: Streamer,
    skillRegistryClient: SkillRegistryClient,
    userInputResolvers: Map<string, UserInputResolver>
  ) {
    this.skillResolver = skillResolver;
    this.skillToToolConverter = skillToToolConverter;
    this.toolRegistry = toolRegistry;
    this.streamer = streamer;
    this.skillRegistryClient = skillRegistryClient;
    this.userInputResolvers = userInputResolvers;
  }

  async plan(context: AgentRunContext): Promise<Plan> {
    const { anthropic, signal, workspace_id, session_id, intent, plannerModel } = context;

    // Load skill manifest and build tool list
    const skills = await this.skillResolver.getAllPublished(signal);
    const tools = this.toolRegistry.buildToolList(skills);

    const systemPrompt = SYSTEM_PROMPT
      .replace('{workspaceId}', workspace_id)
      .replace('{sessionId}', session_id);

    const planSteps: PlanStep[] = [];
    const conversationMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: intent ?? '' },
    ];

    // Multi-turn loop: Claude may use ask_user multiple times before finalising the plan
    let continueLoop = true;
    while (continueLoop && !signal.aborted) {
      const stream = anthropic.messages.stream(
        {
          model: plannerModel,
          max_tokens: 8096,
          system: systemPrompt,
          tools,
          messages: conversationMessages,
        },
        { signal }
      );

      let currentAssistantContent: Anthropic.ContentBlock[] = [];

      // Stream tokens to renderer in real time
      stream.on('text', (text) => {
        if (text) {
          this.streamer.publish({ type: 'token', delta: text });
        }
      });

      const finalMessage = await stream.finalMessage();
      currentAssistantContent = finalMessage.content;

      // Append assistant message to conversation history
      conversationMessages.push({ role: 'assistant', content: currentAssistantContent });

      // Process tool use blocks
      const toolUseBlocks = currentAssistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
        // Claude finished planning without more tool calls
        continueLoop = false;
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        if (signal.aborted) break;

        if (toolBlock.name === ASK_USER_TOOL_NAME) {
          const askInput = toolBlock.input as AskUserInput;
          const userAnswer = await this.suspendForUserInput(askInput, signal);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: String(userAnswer),
          });
        } else if (toolBlock.name === INVOKE_SKILL_PACK_TOOL_NAME) {
          const packInput = toolBlock.input as InvokeSkillPackInput;
          const packSteps = await this.expandSkillPack(packInput, context);
          planSteps.push(...packSteps);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Skill pack "${packInput.pack_key}" expanded to ${packSteps.length} steps.`,
          });
          continueLoop = false;
        } else {
          // This is a skill invocation — add to plan
          const skillName = this.skillToToolConverter.toSkillName(toolBlock.name);
          const step: PlanStep = {
            id: `step-${planSteps.length}`,
            name: this.buildStepName(skillName, skills),
            skill_id: skillName,
            args: (toolBlock.input as Record<string, unknown>) ?? {},
            status: 'pending',
            index: planSteps.length,
          };
          planSteps.push(step);
          this.streamer.publish({ type: 'plan:step_added', step });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Step ${step.index + 1} queued: ${step.name}`,
          });
        }
      }

      if (toolResults.length > 0) {
        conversationMessages.push({ role: 'user', content: toolResults });
      } else {
        continueLoop = false;
      }
    }

    return {
      steps: planSteps,
      session_id,
      workspace_id,
    };
  }

  private suspendForUserInput(askInput: AskUserInput, signal: AbortSignal): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const token = randomUUID();

      this.userInputResolvers.set(token, resolve);

      this.streamer.publish({
        type: 'agent:ask_user',
        token,
        question: askInput.question,
        input_type: askInput.input_type,
        ...(askInput.options !== undefined ? { options: askInput.options } : {}),
      });

      signal.addEventListener(
        'abort',
        () => {
          this.userInputResolvers.delete(token);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    });
  }

  private async expandSkillPack(
    packInput: InvokeSkillPackInput,
    context: AgentRunContext
  ): Promise<PlanStep[]> {
    const packStrategy = new PackStrategy(this.skillRegistryClient);
    const packContext: AgentRunContext = {
      ...context,
      mode: 'pack',
      pack_key: packInput.pack_key,
      ...(packInput.pack_version !== undefined ? { pack_version: packInput.pack_version } : {}),
      pack_inputs: packInput.inputs ?? {},
    };

    const plan = await packStrategy.plan(packContext);
    return plan.steps;
  }

  private buildStepName(skillName: string, skills: import('../types/skill.types.js').SkillDocument[]): string {
    const skill = skills.find((s) => s.name === skillName);
    if (skill) {
      // Convert sk.asset.fetch_raina_input → "Fetch Raina Input"
      const parts = skillName.split('.');
      const action = parts.slice(2).join(' ');
      return action
        .split(/[_\s]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    return skillName;
  }
}
