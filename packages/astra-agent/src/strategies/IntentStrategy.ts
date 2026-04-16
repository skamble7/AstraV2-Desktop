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
Your role is to understand the user's intent and declare the right sequence of skills to execute.

SKILLS
You have access to a set of registered skills (sk.* tools). Each skill:
- Executes exactly one MCP tool and produces one family of artifact kinds
- Has a detailed description explaining WHEN to use it, not just what it does
- May depend on artifacts produced by earlier skills

PLANNING BEHAVIOUR
- Think step by step about what the user wants to produce
- Select only the skills needed — do not include skills that are not required
- Respect dependency order: list skills in the order they must run
- If required inputs are missing or ambiguous, use ask_user to collect them BEFORE declaring any skills
- If the user's intent maps to a known skill pack, use invoke_skill_pack instead of listing individual skills

IMPORTANT — HOW SKILL INVOCATION WORKS
When you call a skill tool, you are declaring it as a planned step — you are NOT executing it.
The platform will execute all declared steps sequentially after you finish planning.
- Declare ALL the skills you want to run in a SINGLE response as multiple tool_use blocks
- Do NOT call one skill, wait for a result, then call the next — there are no live results during planning
- Do NOT narrate step outcomes or claim any work has been done — execution happens after you respond
- After declaring your skills, end your response with a brief plain-English summary of the plan you have assembled

PASSING ARGUMENTS TO SKILLS
Each skill tool call accepts an arguments object. You must populate it with values extracted from the conversation:
- Read the user's message carefully and extract any URLs, names, IDs, or other values the skill needs
- The skill description explains what inputs are required — use it to map conversation content to argument names
- If the user provided a URL, pass it as the relevant URL argument (e.g. url, stories_url, input_url — match the skill description)
- If a required input is genuinely absent from the conversation, use ask_user to collect it before declaring the skill
- Pass workspace_id as {workspaceId} for any skill that requires it

CONSTRAINTS
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

    const systemPrompt = SYSTEM_PROMPT
      .replace('{workspaceId}', workspace_id)
      .replace('{sessionId}', session_id);

    const planSteps: PlanStep[] = [];
    const conversationMessages: Anthropic.MessageParam[] = [
      ...(context.conversationHistory ?? []),
      { role: 'user', content: intent ?? '' },
    ];

    // ── Two-pass manifest scoping ─────────────────────────────────────────────
    // Pass 1: ASTRA skills only (domain: 'astra' or unspecified). This is the correct
    // scope for the vast majority of runs and keeps the tool list tight.
    // Pass 2: If Pass 1 yields no tool calls and the intent signals file/API work,
    // widen to include domain: 'general' skills and re-run.
    const allSkills = await this.skillResolver.getAllPublished(signal);
    const astraSkills = allSkills.filter((s) => (s.domain ?? 'astra') === 'astra');
    const generalSkills = allSkills.filter((s) => s.domain === 'general');

    let tools = this.toolRegistry.buildToolList(astraSkills);

    // Multi-turn loop: Claude may use ask_user multiple times before finalising the plan
    let continueLoop = true;
    // Tracks whether Pass 1 (ASTRA-only) produced no tool calls, enabling Pass 2.
    let pass1Done = false;

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
        if (!pass1Done && generalSkills.length > 0 && this.hasFileOrApiIntent(intent ?? '')) {
          // Pass 2: widen to include general skills and retry with the same messages
          pass1Done = true;
          tools = this.toolRegistry.buildToolList([...astraSkills, ...generalSkills]);
          // Remove the assistant message we just appended — we're retrying with more tools
          conversationMessages.pop();
          continue;
        }
        continueLoop = false;
        break;
      }
      pass1Done = true;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let hasSkillInvocations = false;

      for (const toolBlock of toolUseBlocks) {
        if (signal.aborted) break;

        if (toolBlock.name === ASK_USER_TOOL_NAME) {
          // ask_user — suspend and wait for renderer input, then continue the loop
          // so Claude can proceed to skill selection with the user's answer.
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
          // Skill invocation — add to plan.
          // We must send back a tool_result (Anthropic API requirement) but we exit
          // the loop immediately after. Claude declared this as a planned step, not a
          // live execution — actual MCP invocation happens in ExecutionCore.
          const skillName = this.skillToToolConverter.toSkillName(toolBlock.name);
          const step: PlanStep = {
            id: `step-${planSteps.length}`,
            name: this.buildStepName(skillName, allSkills),
            skill_id: skillName,
            args: (toolBlock.input as Record<string, unknown>) ?? {},
            status: 'pending',
            index: planSteps.length,
          };
          planSteps.push(step);
          this.streamer.publish({ type: 'plan:step_added', step });
          hasSkillInvocations = true;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Step ${step.index + 1} accepted: ${step.name}`,
          });
        }
      }

      if (toolResults.length > 0) {
        conversationMessages.push({ role: 'user', content: toolResults });
      }

      // Exit the loop as soon as real skill steps have been collected.
      // Only ask_user and invoke_skill_pack may extend the loop.
      if (hasSkillInvocations) {
        continueLoop = false;
      } else if (toolResults.length === 0) {
        continueLoop = false;
      }
    }

    return {
      steps: planSteps,
      session_id,
      workspace_id,
      updatedMessages: conversationMessages,
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

  private hasFileOrApiIntent(intent: string): boolean {
    const signals = ['write', 'generate', 'create a document', 'fetch', 'export', 'produce a file', 'download', 'spreadsheet', 'report'];
    const lower = intent.toLowerCase();
    return signals.some((s) => lower.includes(s));
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
