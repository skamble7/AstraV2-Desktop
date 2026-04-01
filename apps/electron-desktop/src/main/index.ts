/**
 * Electron main process entry point.
 *
 * Wires together:
 * - WindowManager (BrowserWindow + security)
 * - AgentRegistry (per-workspace AgentController)
 * - StreamBridge (agent events → renderer IPC)
 * - NotificationServiceClient (WebSocket for skill cache invalidation)
 * - IpcRouter (all ipcMain handler registrations)
 * - ContentSecurityPolicy (CSP headers)
 */

import { app } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { WindowManager } from './WindowManager.js';
import { AgentRegistry } from './agent/AgentRegistry.js';
import { StreamBridge } from './agent/StreamBridge.js';
import { NotificationServiceClient } from './services/NotificationServiceClient.js';
import { WorkspaceServiceClient } from './services/WorkspaceServiceClient.js';
import { IpcRouter } from './ipc/IpcRouter.js';
import { applyContentSecurityPolicy } from './security/ContentSecurityPolicy.js';

// ─── Service Configuration ────────────────────────────────────────────────────
// In production these would come from a config file or environment variables.
// The Anthropic API key is loaded from the system keychain in a real deployment.

const SERVICE_CONFIG = {
  skillRegistryBaseUrl: process.env['SKILL_REGISTRY_URL'] ?? 'http://127.0.0.1:9028',
  sessionServiceBaseUrl: process.env['SESSION_SVC_URL'] ?? 'http://127.0.0.1:9029',
  workspaceManagerBaseUrl: process.env['WORKSPACE_MANAGER_URL'] ?? 'http://127.0.0.1:9027',
  learningServiceBaseUrl: process.env['LEARNING_SVC_URL'] ?? 'http://127.0.0.1:9022',
  configForgeBaseUrl: process.env['CONFIG_FORGE_URL'] ?? 'http://127.0.0.1:8040',
  notificationServiceWsUrl: process.env['NOTIFICATION_WS_URL'] ?? 'ws://127.0.0.1:8016/ws',
  /**
   * Config-forge ref key for the LLM config (credentials + model + provider).
   * Credentials are resolved from config-forge at run time — no API keys in the app.
   */
  plannerConfigRef: process.env['PLANNER_CONFIG_REF'] ?? 'dev.llm.bedrock.explicit-creds',
};

const WORKSPACE_SERVICE_URL = process.env['WORKSPACE_SVC_URL'] ?? 'http://127.0.0.1:8010';

// ─── Application Setup ────────────────────────────────────────────────────────

const windowManager = new WindowManager();
const agentRegistry = new AgentRegistry(SERVICE_CONFIG);
const streamBridge = new StreamBridge(windowManager);
const workspaceClient = new WorkspaceServiceClient(WORKSPACE_SERVICE_URL);
const notificationClient = new NotificationServiceClient(
  SERVICE_CONFIG.notificationServiceWsUrl,
  agentRegistry
);

const ipcRouter = new IpcRouter(agentRegistry, streamBridge, workspaceClient, {
  workspaceManagerBaseUrl: SERVICE_CONFIG.workspaceManagerBaseUrl,
  sessionServiceBaseUrl: SERVICE_CONFIG.sessionServiceBaseUrl,
  skillRegistryBaseUrl: SERVICE_CONFIG.skillRegistryBaseUrl,
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.astra.desktop');

  // Apply security before creating any windows
  applyContentSecurityPolicy();

  // Register all IPC handlers
  ipcRouter.registerAll();

  // Create the main window
  windowManager.createMainWindow();

  // Start listening for skill cache invalidation events
  notificationClient.start();

  // On macOS, re-create window when dock icon is clicked with no windows open
  app.on('activate', () => {
    if (windowManager.getMainWindow() === null) {
      windowManager.createMainWindow();
    }
  });

  // Electron security: open devtools only in dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
});

app.on('window-all-closed', () => {
  notificationClient.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
