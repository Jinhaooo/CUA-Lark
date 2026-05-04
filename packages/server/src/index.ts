import { createServer } from './http/server.js';
import { loadServerConfig } from './config/ServerConfigLoader.js';
import { registerRoutes } from './http/routes/index.js';
import { createTaskQueue } from './queue/TaskQueue.js';
import { createEventBus } from './sse/SseBroker.js';
import { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import { TracePersister } from '@cua-lark/core/src/trace/TracePersister.js';

async function main() {
  const config = loadServerConfig();
  const server = createServer(config);
  
  const traceStore = new SqliteTraceStore(config.trace.dbPath);
  const eventBus = createEventBus();
  const tracePersister = new TracePersister(eventBus, traceStore);
  tracePersister.start();
  const taskQueue = createTaskQueue(config.taskQueue.maxSize, eventBus, traceStore);

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
