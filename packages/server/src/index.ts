/**
 * cua-lark backend entry · 接线 SkillRouter / HarnessLoop 实运行（替换 M4 mock TaskQueue）
 */
import { createServer } from './http/server.js';
import { loadServerConfig } from './config/ServerConfigLoader.js';
import { registerRoutes } from './http/routes/index.js';
import { createTaskQueue } from './queue/TaskQueue.js';
import { createEventBus } from './sse/SseBroker.js';
import { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import { TracePersister } from '@cua-lark/core/src/trace/TracePersister.js';
import { SkillRegistry } from '@cua-lark/core/src/skill/SkillRegistry.js';
import { UiaClient } from '@cua-lark/uia-bridge';
import { OcrClient } from '@cua-lark/ocr-bridge';

// 内核接线（从 @cua-lark/core 主入口）
import {
  LarkOperator,
  ModelClientImpl,
  loadModelEnv,
  SkillRouterImpl,
  HarnessLoop,
  ToolRegistryImpl,
  screenshotTool, uiaFindTool, uiaFindAllTool, ocrLocateTool, ocrReadTool,
  vlmLocateTool, readStateTool, waitForLoadingTool,
  clickTool, doubleClickTool, rightClickTool, typeTool, hotkeyTool,
  scrollTool, dragTool, waitTool, waitUntilTool, activateLarkTool,
  verifyVlmTool, verifyOcrTool, verifyPixelTool, verifyA11yTool,
  riskClassifierTool, failureAnalystTool,
  finishedTool, callUserTool, recordEvidenceTool, askUserTool, loadSkillTool,
} from '@cua-lark/core';
import path from 'path';

async function main() {
  const config = loadServerConfig();
  const server = createServer(config);

  /* ===== Trace + EventBus ===== */
  const traceStore = new SqliteTraceStore(config.trace.dbPath);
  const eventBus = createEventBus();
  const tracePersister = new TracePersister(eventBus, traceStore);
  tracePersister.start();

  /* ===== ModelClient（VLM） ===== */
  let modelClient: ModelClientImpl | null = null;
  try {
    const modelEnv = loadModelEnv();
    modelClient = new ModelClientImpl(modelEnv.vlm, modelEnv.llm);
    console.log('[server] ModelClient initialized:', modelEnv.vlm.model);
  } catch (err) {
    console.warn('[server] ModelClient init failed (env missing):', err instanceof Error ? err.message : err);
    console.warn('[server] runAgent calls will fail until CUA_VLM_BASE_URL/CUA_VLM_API_KEY/CUA_VLM_MODEL is set in .env');
  }

  /* ===== UIA / OCR clients ===== */
  // UIA: spawns a PowerShell server on Windows (no-op on other platforms).
  // The constructor never throws — its methods return null when the bridge
  // process fails to start. We probe `isA11yEnabled` to log status.
  const uiaClient = new UiaClient();
  // Adaptive disablement: if a11y is off, expose no uia_* tools to the agent.
  // The bridge probe counts top-level Lark window descendants; <50 means
  // Electron isn't projecting its accessibility tree (the S0 baseline from
  // docs/uia-feasibility-report-v2.md). Cached at boot — restart server after
  // toggling Narrator / a11y to re-evaluate.
  let uiaA11yEnabled = false;
  try {
    const health = await uiaClient.isA11yEnabled();
    uiaA11yEnabled = health.enabled;
    console.log(`[server] UiaClient initialized: enabled=${health.enabled} nodeCount=${health.nodeCount}`);
    if (!health.enabled) {
      console.log('[server] a11y disabled → uia_find / uia_find_all / verify_a11y will be hidden from the agent. Run Windows Narrator once to enable (see README "Enable a11y for UIA").');
    }
  } catch (err) {
    console.warn('[server] UiaClient health probe failed:', err instanceof Error ? err.message : err);
  }

  // OCR: opt-in. The Python OCR bridge ships at packages/ocr-bridge/server.py
  // but isn't auto-spawned because PaddleOCR's first run downloads weights and
  // can stall startup. Set CUA_OCR_BASE_URL=http://127.0.0.1:7010 in .env once
  // you've started the bridge yourself (`pnpm --filter @cua-lark/ocr-bridge dev`).
  let ocrClient: OcrClient | undefined;
  const ocrBaseUrl = process.env.CUA_OCR_BASE_URL;
  if (ocrBaseUrl) {
    ocrClient = new OcrClient(ocrBaseUrl);
    try {
      const ping = await fetch(`${ocrBaseUrl}/health`).then((r) => r.ok).catch(() => false);
      console.log(`[server] OcrClient initialized: ${ocrBaseUrl} healthy=${ping}`);
    } catch {
      console.warn(`[server] OcrClient probe failed for ${ocrBaseUrl}`);
    }
  } else {
    console.log('[server] OCR not enabled (set CUA_OCR_BASE_URL to enable)');
  }

  /* ===== LarkOperator + ToolRegistry ===== */
  const operator = new LarkOperator();
  const toolRegistry = new ToolRegistryImpl();
  const allTools = [
    screenshotTool, uiaFindTool, uiaFindAllTool, ocrLocateTool, ocrReadTool,
    vlmLocateTool, readStateTool, waitForLoadingTool,
    clickTool, doubleClickTool, rightClickTool, typeTool, hotkeyTool,
    scrollTool, dragTool, waitTool, waitUntilTool, activateLarkTool,
    verifyVlmTool, verifyOcrTool, verifyPixelTool, verifyA11yTool,
    riskClassifierTool, failureAnalystTool,
    finishedTool, callUserTool, recordEvidenceTool, askUserTool, loadSkillTool,
  ];
  for (const tool of allTools) {
    if (tool) toolRegistry.register(tool as any);
  }
  console.log(`[server] ToolRegistry: ${allTools.filter(Boolean).length} tools registered`);

  /* ===== SkillRegistry ===== */
  const skillRegistry = new SkillRegistry();
  const skillsRoot = path.resolve(process.cwd(), '../skills');
  try {
    await skillRegistry.loadFromFs(skillsRoot);
    console.log(`[server] SkillRegistry: ${skillRegistry.list().length} skills loaded from ${skillsRoot}`);
  } catch (err) {
    console.warn('[server] SkillRegistry load failed:', err);
  }

  /* ===== SkillRouter + HarnessLoop ===== */
  const skillRouter = new SkillRouterImpl();
  const harnessLoop = new HarnessLoop(toolRegistry as any, eventBus);

  /* ===== TaskQueue with real backend wiring ===== */
  const taskQueue = createTaskQueue(config.taskQueue.maxSize, eventBus, traceStore, {
    skillRouter,
    skillRegistry,
    harnessLoop,
    operator,
    modelClient,
    uia: uiaClient,
    ocr: ocrClient,
    uiaA11yEnabled,
    toolRegistry,
  });

  await registerRoutes(server, {
    config,
    eventBus,
    taskQueue,
    traceStore,
    uia: uiaClient,
    ocr: ocrClient,
    modelClient,
  });

  try {
    await server.listen({ host: config.host, port: config.port });
    console.log(`Server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
