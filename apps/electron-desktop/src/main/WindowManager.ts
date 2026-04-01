/**
 * WindowManager — creates and tracks the main BrowserWindow.
 *
 * Applies all Electron security best practices:
 * - nodeIntegration: false
 * - contextIsolation: true
 * - sandbox: true (strongest isolation — preload limited to contextBridge)
 * - webSecurity: true
 * - Navigation locked to prevent renderer from opening external URLs
 */

import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 16 } } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
      },
    });

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Lock navigation — renderer cannot navigate to external URLs
    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      const parsedUrl = new URL(url);
      // Allow only file:// (dev) and the loaded app origin
      if (parsedUrl.protocol !== 'file:' && !is.dev) {
        event.preventDefault();
      }
    });

    // Open external links in system browser, not in the app window
    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Broadcasts an IPC event to the renderer. Safe to call from any main process code.
   */
  sendToRenderer(channel: string, payload: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }
}
