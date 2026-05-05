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
  scrollTool, dragTool, waitTool, waitUntilTool,
  verifyVlmTool, verifyOcrTool, verifyPixelTool, verifyA11yTool,
  riskClassifierTool, failureAnalystTool,
  finishedTool, callUserTool, recordEvidenceTool, askUserTool,
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

  /* ===== LarkOperator + ToolRegistry ===== */
  const operator = new LarkOperator();
  const toolRegistry = new ToolRegistryImpl();
  const allTools = [
    screenshotTool, uiaFindTool, uiaFindAllTool, ocrLocateTool, ocrReadTool,
    vlmLocateTool, readStateTool, waitForLoadingTool,
    clickTool, doubleClickTool, rightClickTool, typeTool, hotkeyTool,
    scrollTool, dragTool, waitTool, waitUntilTool,
    verifyVlmTool, verifyOcrTool, verifyPixelTool, verifyA11yTool,
    riskClassifierTool, failureAnalystTool,
    finishedTool, callUserTool, recordEvidenceTool, askUserTool,
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
  });

  await registerRoutes(server, { config, eventBus, taskQueue, traceStore });

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
