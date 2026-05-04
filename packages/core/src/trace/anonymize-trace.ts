import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

const SENSITIVE_PATTERNS = [
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  /(1[3-9]\d{9})/g,
  /(\d{18})/g,
  /(\d{17}[\dXx])/g,
];

const REPLACEMENT_MAP: Record<string, string> = {};
let counter = 0;

function anonymizeText(text: string): string {
  let result = text;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (!REPLACEMENT_MAP[match]) {
        REPLACEMENT_MAP[match] = `[REDACTED-${++counter}]`;
      }
      return REPLACEMENT_MAP[match];
    });
  }
  
  return result;
}

function anonymizeObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return anonymizeText(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(anonymizeObject);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = anonymizeObject(value);
    }
    return result;
  }
  
  return obj;
}

export async function anonymizeTraceFile(inputPath: string, outputPath?: string): Promise<void> {
  const content = await readFile(inputPath, 'utf-8');
  
  const lines = content.split('\n').filter(line => line.trim());
  const anonymizedLines: string[] = [];
  
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const anonymized = anonymizeObject(event);
      anonymizedLines.push(JSON.stringify(anonymized));
    } catch {
      anonymizedLines.push(line);
    }
  }
  
  const output = outputPath || resolve(inputPath + '.anonymized');
  await writeFile(output, anonymizedLines.join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  
  if (!inputPath) {
    console.error('Usage: node anonymize-trace.ts <input.jsonl> [output.jsonl]');
    process.exit(1);
  }
  
  anonymizeTraceFile(inputPath, outputPath)
    .then(() => console.log('Anonymization complete'))
    .catch(console.error);
}