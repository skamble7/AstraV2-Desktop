/**
 * AgentIpcHandler — handles all agent:* IPC channels.
 *
 * Delegates to AgentRegistry to get/create the correct AgentController per workspace.
 * StreamBridge is attached when a run starts to forward events to the renderer.
 *
 * Payload validation is performed with zod before any processing.
 */

import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import type { AgentRegistry } from '../agent/AgentRegistry.js';
import type { StreamBridge } from '../agent/StreamBridge.js';

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
    const controller = agentRegistry.getOrCreate(payload.workspace_id);
    streamBridge.attach(controller);
    // Fire-and-forget: run is async, events flow via StreamBridge
    void controller.startIntentRun(payload.message, payload.session_id);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN_PACK, async (_event, rawPayload: unknown) => {
    const payload = RunPackSchema.parse(rawPayload);
    const controller = agentRegistry.getOrCreate(payload.workspace_id);
    streamBridge.attach(controller);
    void controller.startPackRun(
      payload.pack_key,
      payload.pack_version,
      payload.inputs,
      payload.session_id
    );
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async (_event, rawPayload: unknown) => {
    const payload = CancelSchema.parse(rawPayload);
    agentRegistry.cancelRun(payload.workspace_id);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_PROVIDE_INPUT, async (_event, rawPayload: unknown) => {
    const payload = ProvideInputSchema.parse(rawPayload);
    // Find the controller that owns this token
    // Since token is unique across all runs, we can scan registries
    // In practice, only one workspace will be awaiting user input at a time
    // AgentController.provideUserInput is a no-op if the token doesn't match
    // We could make AgentRegistry expose a provideInput method that searches all,
    // but for now we rely on the caller passing workspace_id alongside token in future iterations.
    // The renderer always knows the active workspace, so this can be extended later.
    // For now: iterate all controllers and try each (token is unique).
    for (const [workspaceId] of Object.entries({})) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void workspaceId; // placeholder
    }
    agentRegistry.provideInputToActive(payload.token, payload.value);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_APPROVE_PLAN, async (_event, rawPayload: unknown) => {
    const payload = ApprovePlanSchema.parse(rawPayload);
    agentRegistry.approvePlan(payload.token, payload.approved);
    return { ok: true };
  });
}
