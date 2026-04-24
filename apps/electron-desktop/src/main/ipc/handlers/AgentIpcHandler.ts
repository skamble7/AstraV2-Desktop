/**
 * AgentIpcHandler — handles all agent:* IPC channels.
 *
 * Routes by both workspace_id and session_id (the conversation ID) to get/create
 * the correct AgentController. StreamBridge is attached per conversation so
 * multiple conversations can stream events simultaneously.
 *
 * Payload validation is performed with zod before any processing.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import type { AgentRegistry } from '../../agent/AgentRegistry.js';
import type { StreamBridge } from '../../agent/StreamBridge.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const SendMessageSchema = z.object({
  workspace_id: z.string().min(1),
  message: z.string().min(1),
  session_id: z.string().min(1),
});

const RunPackSchema = z.object({
  workspace_id: z.string().min(1),
  pack_key: z.string().min(1),
  pack_version: z.string().default('latest'),
  inputs: z.record(z.unknown()).default({}),
  session_id: z.string().min(1),
});

const CancelSchema = z.object({
  workspace_id: z.string().min(1),
  conversation_id: z.string().min(1),
});

const ProvideInputSchema = z.object({
  token: z.string().min(1),
  value: z.unknown(),
});

const ApprovePlanSchema = z.object({
  token: z.string().min(1),
  approved: z.boolean(),
});

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerAgentIpcHandlers(
  agentRegistry: AgentRegistry,
  streamBridge: StreamBridge
): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_SEND_MESSAGE, async (_event, rawPayload: unknown) => {
    const payload = SendMessageSchema.parse(rawPayload);
    // session_id is the conversationId — used as the routing key for the controller
    const conversationId = payload.session_id;
    const controller = agentRegistry.getOrCreateController(payload.workspace_id, conversationId);
    streamBridge.attach(conversationId, controller);
    // Fire-and-forget: run is async, events flow via StreamBridge
    void controller.startIntentRun(payload.message, conversationId);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN_PACK, async (_event, rawPayload: unknown) => {
    const payload = RunPackSchema.parse(rawPayload);
    const conversationId = payload.session_id;
    const controller = agentRegistry.getOrCreateController(payload.workspace_id, conversationId);
    streamBridge.attach(conversationId, controller);
    void controller.startPackRun(
      payload.pack_key,
      payload.pack_version,
      payload.inputs,
      conversationId
    );
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async (_event, rawPayload: unknown) => {
    const payload = CancelSchema.parse(rawPayload);
    agentRegistry.cancelRun(payload.workspace_id, payload.conversation_id);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_PROVIDE_INPUT, async (_event, rawPayload: unknown) => {
    const payload = ProvideInputSchema.parse(rawPayload);
    // Tokens are globally unique UUIDs — at most one controller across all workspaces responds.
    agentRegistry.provideInputToActive(payload.token, payload.value);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_APPROVE_PLAN, async (_event, rawPayload: unknown) => {
    const payload = ApprovePlanSchema.parse(rawPayload);
    agentRegistry.approvePlan(payload.token, payload.approved);
    return { ok: true };
  });
}
