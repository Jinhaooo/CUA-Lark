import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { app } from 'electron';

export interface OverlayConfig {
  enabled: boolean;
  border: {
    color: string;
    pausedColor: string;
    width: string;
    breathDurationMs: number;
  };
  highlight: {
    color: string;
    radiusPx: number;
    durationMs: number;
    fadeOutMs: number;
  };
  thoughtCard: {
    enabled: boolean;
    durationMs: number;
    maxChars: number;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    offsetTopPx: number;
    offsetRightPx: number;
  };
  pauseButton: {
    enabled: boolean;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    color: string;
    sizePx: number;
    persistPosition: boolean;
  };
  hotkey: {
    primary: string;
    fallback: string[];
  };
  display: {
    coverPrimaryOnly: boolean;
    fullscreen: boolean;
  };
}

// SAFETY: default disabled. A misconfigured / unloadable yaml must not produce
// a fullscreen alwaysOnTop overlay covering the user's desktop.
const defaultConfig: OverlayConfig = {
  enabled: false,
  border: {
    color: '#8B5CF6',
    pausedColor: '#F97316',
    width: '0.4vh',
    breathDurationMs: 2000,
  },
  highlight: {
    color: '#10B981',
    radiusPx: 40,
    durationMs: 300,
    fadeOutMs: 200,
  },
  thoughtCard: {
    enabled: true,
    durationMs: 3000,
    maxChars: 100,
    position: 'top-right',
    offsetTopPx: 80,
    offsetRightPx: 24,
  },
  pauseButton: {
    enabled: true,
    position: 'bottom-right',
    color: '#EF4444',
    sizePx: 56,
    persistPosition: true,
  },
  hotkey: {
    primary: 'Escape',
    fallback: ['F12', 'Ctrl+Shift+P'],
  },
  display: {
    coverPrimaryOnly: true,
    fullscreen: true,
  },
};

let config: OverlayConfig | null = null;

export function loadOverlayConfig(): OverlayConfig {
  if (config) {
    return config;
  }

  // The compiled main bundle lives at frontend/dist/main/main.js, but the
  // config file is at cua-lark/configs/overlay.yaml. Try several candidates
  // since path-from-bundle drift causes silent fallback to default config.
  const appPath = (() => {
    try { return app.getAppPath(); } catch { return process.cwd(); }
  })();
  const candidates = [
    process.env.CUA_OVERLAY_CONFIG, // explicit override
    path.join(appPath, '..', 'configs', 'overlay.yaml'), // frontend/.. = cua-lark
    path.join(appPath, 'configs', 'overlay.yaml'), // cua-lark itself
    path.join(__dirname, '../../../../configs/overlay.yaml'), // dev unbundled
    path.join(__dirname, '../../../configs/overlay.yaml'), // dev bundled
    path.join(process.cwd(), 'configs', 'overlay.yaml'),
  ].filter((p): p is string => Boolean(p));

  for (const configPath of candidates) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const loaded = yaml.load(yamlContent) as { overlay?: Partial<OverlayConfig> } | null;
      config = { ...defaultConfig, ...(loaded?.overlay ?? {}) };
      return config;
    } catch {
      // try next candidate
    }
  }

  config = defaultConfig;
  return config;
}

export function getOverlayConfig(): OverlayConfig {
  return config || loadOverlayConfig();
}