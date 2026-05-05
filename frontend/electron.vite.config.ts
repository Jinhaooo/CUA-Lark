/**
 * CUA-Lark Electron-Vite config (decoupled from UI-TARS-desktop workspace).
 *
 * 与 UI-TARS-desktop 原版差异：
 *   - main/preload/renderer 在 frontend/ 根（不再嵌套 src/）
 *   - 移除 bytecodePlugin（无需 UI_TARS_APP_PRIVATE_KEY 私钥保护）
 *   - 移除 native-node-module-path 强外化（保留通用 externalizeDepsPlugin）
 */
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import pkg from './package.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: { entry: './main/main.ts' },
      rollupOptions: {
        external: [
          /^@computer-use\/mac-screen-capture-permissions/,
          /screencapturepermissions\.node$/,
        ],
      },
    },
    plugins: [tsconfigPaths(), externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: './preload/index.ts',
      },
    },
    plugins: [tsconfigPaths()],
  },
  renderer: {
    root: 'renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          main: resolve('./renderer/index.html'),
        },
      },
      minify: true,
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern',
        },
      },
    },
    plugins: [react(), tsconfigPaths(), tailwindcss()],
    define: {
      APP_VERSION: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        crypto: resolve(__dirname, 'renderer/src/polyfills/crypto.ts'),
        '@resources': resolve(__dirname, 'pictures'),
      },
    },
  },
});
