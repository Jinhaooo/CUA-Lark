/**
 * M4.1.0.3 · JSONL → SQLite 一次性导入脚本
 *
 * 把 M3.5 已有 traces/ 目录下的 JSONL 数据迁入 SQLite。
 * 幂等：重复跑不会写重复（按 event.id 去重 / SqliteTraceStore.appendStreaming 已用 onConflictDoNothing）。
 * 用法：
 *   pnpm tsx scripts/migrate-jsonl-to-sqlite.ts [--dry-run] [--traces-dir ./traces]
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import type { TraceEvent } from '@cua-lark/core/src/types.js';

interface CliOptions {
  dryRun: boolean;
  tracesDir: string;
  dbPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    tracesDir: './traces',
    dbPath: './traces/cua-lark.db',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--traces-dir') {
      opts.tracesDir = argv[++i] ?? opts.tracesDir;
    } else if (arg === '--db-path') {
      opts.dbPath = argv[++i] ?? opts.dbPath;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
Usage: migrate-jsonl-to-sqlite [options]

Migrate M3.5 JSONL trace files into the M4 SQLite trace store.

Options:
  --dry-run             Scan only, do not write
  --traces-dir <path>   Source traces directory (default: ./traces)
  --db-path <path>      SQLite database path (default: ./traces/cua-lark.db)
  -h, --help            Show this help
`);
}

async function listRunDirs(tracesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(tracesDir);
    const dirs: string[] = [];
    for (const name of entries) {
      const full = join(tracesDir, name);
      try {
        const s = await stat(full);
        if (s.isDirectory()) dirs.push(full);
      } catch {
      }
    }
    return dirs;
  } catch {
    return [];
  }
}

async function readJsonlEvents(eventsFile: string): Promise<TraceEvent[]> {
  const content = await readFile(eventsFile, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const events: TraceEvent[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as TraceEvent;
      if (typeof event.id === 'string' && typeof event.test_run_id === 'string') {
        events.push(event);
      }
    } catch {
    }
  }
  return events;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const tracesDir = resolve(opts.tracesDir);

  console.log(`[migrate] traces dir = ${tracesDir}`);
  console.log(`[migrate] db path    = ${opts.dbPath}`);
  console.log(`[migrate] dry-run    = ${opts.dryRun}`);

  const runDirs = await listRunDirs(tracesDir);
  console.log(`[migrate] found ${runDirs.length} run directories`);

  let totalScanned = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const store = opts.dryRun ? null : new SqliteTraceStore(opts.dbPath);

  for (const runDir of runDirs) {
    const eventsFile = join(runDir, 'events.jsonl');
    let events: TraceEvent[] = [];
    try {
      events = await readJsonlEvents(eventsFile);
    } catch {
      continue;
    }

    if (events.length === 0) continue;

    totalScanned += events.length;

    if (opts.dryRun) {
      console.log(`  [scan] ${runDir}: ${events.length} events`);
      continue;
    }

    for (const event of events) {
      try {
        await store!.appendStreaming(event);
        totalWritten += 1;
      } catch (error) {
        totalErrors += 1;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('UNIQUE')) {
          totalSkipped += 1;
          totalErrors -= 1;
        } else {
          console.error(`  [error] event ${event.id}: ${message}`);
        }
      }
    }
    console.log(`  [migrated] ${runDir}: ${events.length} events`);
  }

  if (store) store.close();

  console.log('\n[migrate] summary');
  console.log(`  scanned: ${totalScanned}`);
  console.log(`  written: ${totalWritten}`);
  console.log(`  skipped (already exist): ${totalSkipped}`);
  console.log(`  errors:  ${totalErrors}`);

  if (totalErrors > 0) process.exit(1);
}

main().catch((error) => {
  console.error('[migrate] fatal:', error);
  process.exit(1);
});
