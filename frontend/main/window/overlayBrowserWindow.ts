import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '@main/logger';
import { getOverlayConfig } from '@main/services/overlayConfig';
import * as env from '@main/env';

let overlayWindow: BrowserWindow | null = null;

/**
 * Create the transparent fullscreen overlay window (M6 Visual Overlay).
 *
 * Returns `null` when:
 *  - `overlay.enabled` is false in `configs/overlay.yaml` (kill switch), OR
 *  - the overlay-renderer build is missing AND no dedicated dev server is configured.
 *
 * Refusing to create is the safe default: a fullscreen + alwaysOnTop window
 * that fails to load a transparent renderer paints an opaque error page over
 * the whole screen and the user can no longer click through to anything.
 */
export function createOverlayWindow(): BrowserWindow | null {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const config = getOverlayConfig();
  if (!config.enabled) {
    logger.info('[Overlay] disabled via configs/overlay.yaml; skipping creation');
    return null;
  }

  // Pick the renderer URL. In dev we expect a dedicated vite server for
  // overlay-renderer (env CUA_OVERLAY_URL or default :5175). In prod we load
  // the built index.html. If neither is reachable, refuse to open the window
  // — opening a fullscreen alwaysOnTop window pointing at a 404 cooks the
  // user's desktop until they kill the process.
  const overlayDevUrl = process.env.CUA_OVERLAY_URL || (env.isDev ? 'http://localhost:5175' : '');
  const overlayDistPath = path.join(__dirname, '../../dist/overlay-renderer/index.html');
  const hasProdBuild = !env.isDev && existsSync(overlayDistPath);
  if (!overlayDevUrl && !hasProdBuild) {
    logger.warn('[Overlay] No renderer source available (no CUA_OVERLAY_URL, no built dist). Skipping window creation.');
    return null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    transparent: true,
    alwaysOnTop: true,
    frame: false,
    fullscreen: false,
    show: false,
    hasShadow: false,
    focusable: false,
    skipTaskbar: true,
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Mouse passthrough on by default — flipped via overlay:enable-mouse-forwarding.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  try {
    overlayWindow.setVisibleOnAllWorkspaces(true);
  } catch {
    // macOS-only; ignore on Windows.
  }

  // Only show after the renderer reports successful load. This prevents the
  // brief flash of an opaque "loading" frame from blocking the desktop.
  overlayWindow.webContents.once('did-finish-load', () => {
    if (overlayWindow && !overlayWindow.isDestroyed() && config.display?.fullscreen !== false) {
      overlayWindow.setFullScreen(true);
      overlayWindow.show();
    }
  });
  overlayWindow.webContents.on('did-fail-load', (_e, _code, desc) => {
    logger.error(`[Overlay] Renderer failed to load (${desc}); window will stay hidden.`);
  });

  if (overlayDevUrl) {
    void overlayWindow.loadURL(overlayDevUrl).catch((err: unknown) => {
      logger.error('[Overlay] Failed to load dev URL:', err);
    });
  } else {
    void overlayWindow.loadFile(overlayDistPath).catch((err: unknown) => {
      logger.error('[Overlay] Failed to load file:', err);
    });
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  ipcMain.on('overlay:enable-mouse-forwarding', () => {
    overlayWindow?.setIgnoreMouseEvents(false);
    logger.debug('[Overlay] Mouse forwarding enabled');
  });

  ipcMain.on('overlay:disable-mouse-forwarding', () => {
    overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
    logger.debug('[Overlay] Mouse forwarding disabled');
  });

  return overlayWindow;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function showOverlayWindow(): void {
  overlayWindow?.show();
}

export function hideOverlayWindow(): void {
  overlayWindow?.hide();
}

export function updateOverlayState(state: unknown): void {
  overlayWindow?.webContents.send('overlay:update-state', state);
}

export function updateOverlayConfig(config: unknown): void {
  overlayWindow?.webContents.send('overlay:config-change', config);
}
