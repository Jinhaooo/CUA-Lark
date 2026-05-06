/**
 * Auto-spawn the @cua-lark/dashboard vite dev server alongside the Electron
 * frontend in dev mode. Saves the user from running `pnpm --filter
 * @cua-lark/dashboard dev` in a separate terminal — the embedded /dashboard
 * route just works.
 *
 * In packaged builds the dashboard SPA is served by the Fastify backend
 * (@fastify/static at /dashboard/), so this module is a no-op in prod.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import { logger } from '@main/logger';
import * as env from '@main/env';

const DASHBOARD_PORT = 5174;
let child: ChildProcess | null = null;

function probePort(port: number, hostname = '127.0.0.1', timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname, port, path: '/', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export async function startDashboardDevServer(): Promise<void> {
  if (!env.isDev) {
    logger.info('[dashboard] prod mode; skipping dev server spawn (Fastify @fastify/static serves /dashboard/)');
    return;
  }

  // Don't double-spawn if the user already runs `pnpm --filter @cua-lark/dashboard dev`.
  if (await probePort(DASHBOARD_PORT) || await probePort(DASHBOARD_PORT, 'localhost')) {
    logger.info(`[dashboard] :${DASHBOARD_PORT} already in use; assuming external dev server, not spawning`);
    return;
  }

  // Find the workspace root: frontend/ sits next to cua-lark/, so go up two.
  // Walk up to find the directory that contains both `frontend` and `packages`.
  const workspaceRoot = (() => {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs') as typeof import('node:fs');
        if (
          fs.existsSync(path.join(dir, 'packages', 'dashboard', 'package.json')) &&
          fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))
        ) {
          return dir;
        }
      } catch {
        // ignore
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  })();

  if (!workspaceRoot) {
    logger.warn('[dashboard] could not locate cua-lark workspace root; skipping dev server spawn');
    return;
  }

  // On Windows, `pnpm` is a .cmd shim and node's spawn returns EINVAL unless
  // we go through the shell. POSIX prefers shell:false to avoid quoting holes.
  const useShell = process.platform === 'win32';
  const pnpmCmd = useShell ? 'pnpm' : 'pnpm';
  logger.info(`[dashboard] spawning vite dev server: pnpm --filter @cua-lark/dashboard dev (cwd=${workspaceRoot})`);

  child = spawn(pnpmCmd, ['--filter', '@cua-lark/dashboard', 'dev'], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    detached: false,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) logger.info(`[dashboard:vite] ${text}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) logger.warn(`[dashboard:vite-err] ${text}`);
  });
  child.on('exit', (code, signal) => {
    logger.info(`[dashboard] dev server exited code=${code} signal=${signal}`);
    child = null;
  });
}

export function stopDashboardDevServer(): void {
  if (!child) return;
  logger.info('[dashboard] stopping dev server');
  try {
    if (process.platform === 'win32') {
      // Default kill on Windows doesn't propagate to npm/pnpm grandchildren.
      // taskkill /T cleans the whole tree.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch (err) {
    logger.warn('[dashboard] failed to kill dev server:', err);
  }
  child = null;
}
