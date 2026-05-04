import type { Box, OcrClient } from '../types.js';
import type { ModelClient } from '../model/types.js';
import type { LarkOperator } from './LarkOperator.js';
import type { UiaElement, UiaRole } from '@cua-lark/uia-bridge';

export type LocateStrategy = 'uia-first' | 'ocr-first' | 'vlm-only' | 'uia-only';

export interface LocateSpec {
  uia?: { role: UiaRole; name: string | RegExp };
  ocr?: { text: string | RegExp; region?: Box };
  vlm?: { prompt: string };
  strategy?: LocateStrategy;
}

export interface LocateResult {
  box: Box;
  source: 'uia' | 'ocr' | 'vlm';
  confidence: number;
  durationMs: number;
}

interface LRUCacheEntry {
  box: Box;
  timestamp: number;
}

export class HybridLocator {
  private uiaCache = new Map<string, LRUCacheEntry>();
  private readonly cacheMaxSize = 100;
  private readonly cacheTtlMs = 5000;
  private uiaDirty = false;

  constructor(
    private operator: LarkOperator,
    private uia: { findElement(spec: { role: UiaRole; name: string | RegExp; scope?: string }): Promise<UiaElement | null> } | null,
    private ocr: OcrClient | null,
    private model: ModelClient
  ) {}

  private makeCacheKey(role: string, name: string): string {
    return `${role}:${name}`;
  }

  private getCached(key: string): Box | null {
    const entry = this.uiaCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.uiaCache.delete(key);
      return null;
    }
    return entry.box;
  }

  private setCached(key: string, box: Box): void {
    if (this.uiaCache.size >= this.cacheMaxSize) {
      const firstKey = this.uiaCache.keys().next().value;
      if (firstKey) this.uiaCache.delete(firstKey);
    }
    this.uiaCache.set(key, { box, timestamp: Date.now() });
  }

  markUiaDirty(): void {
    this.uiaDirty = true;
  }

  private invalidateCacheIfNeeded(): void {
    if (this.uiaDirty) {
      this.uiaCache.clear();
      this.uiaDirty = false;
    }
  }

  async byIntent(spec: LocateSpec): Promise<LocateResult | null> {
    const strategy = spec.strategy ?? 'uia-first';

    this.invalidateCacheIfNeeded();

    if (strategy === 'uia-first' || strategy === 'uia-only') {
      if (spec.uia) {
        const uiaResult = await this.byUia(spec.uia.role, spec.uia.name);
        if (uiaResult) {
          return { box: uiaResult, source: 'uia', confidence: 1.0, durationMs: 0 };
        }
        if (strategy === 'uia-only') {
          return null;
        }
      }
    }

    if (strategy === 'ocr-first' || strategy === 'uia-first') {
      if (spec.ocr) {
        const ocrResult = await this.byOcr(spec.ocr.text, spec.ocr.region);
        if (ocrResult) {
          return { box: ocrResult, source: 'ocr', confidence: 0.9, durationMs: 0 };
        }
        if (strategy === 'ocr-first') {
          if (spec.vlm) {
            const vlmResult = await this.byVlm(spec.vlm.prompt);
            if (vlmResult) {
              return { box: vlmResult, source: 'vlm', confidence: 0.7, durationMs: 0 };
            }
          }
          return null;
        }
      }
    }

    if (spec.vlm) {
      const vlmResult = await this.byVlm(spec.vlm.prompt);
      if (vlmResult) {
        return { box: vlmResult, source: 'vlm', confidence: 0.7, durationMs: 0 };
      }
    }

    return null;
  }

  async byUia(role: UiaRole, name: string | RegExp): Promise<Box | null> {
    if (!this.uia) return null;

    const nameStr = typeof name === 'string' ? name : name.source;
    const cached = this.getCached(`${role}:${nameStr}`);
    if (cached) return cached;

    const element = await this.uia.findElement({ role, name, scope: 'descendants' });
    if (!element) return null;

    const box = {
      x: element.boundingRectangle.x,
      y: element.boundingRectangle.y,
      width: element.boundingRectangle.width,
      height: element.boundingRectangle.height,
    };
    this.setCached(`${role}:${nameStr}`, box);
    return box;
  }

  async byOcr(text: string | RegExp, region?: Box): Promise<Box | null> {
    if (!this.ocr) return null;

    const shot = await this.operator.screenshot();
    const imageBuffer = Buffer.from(shot.base64, 'base64');

    const ocrRegion = region
      ? { x1: region.x, y1: region.y, x2: region.x + region.width, y2: region.y + region.height }
      : undefined;
    const tokens = await this.ocr.recognize(imageBuffer, ocrRegion);

    const nameStr = typeof text === 'string' ? text : text.source;
    const regex = typeof text === 'string'
      ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : text;

    for (const token of tokens) {
      if (regex.test(token.text)) {
        const [x1, y1, x2, y2] = token.box;
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      }
    }

    return null;
  }

  async byVlm(prompt: string): Promise<Box | null> {
    const shot = await this.operator.screenshot();

    const resp = await this.model.chatVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}\n请以 JSON 返回 {"box": [x1,y1,x2,y2]} 或 {"box": null}` },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + shot.base64, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const parsed = JSON.parse(resp.content);
      if (parsed.box && Array.isArray(parsed.box) && parsed.box.length === 4) {
        const [x1, y1, x2, y2] = parsed.box;
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      }
    } catch {}

    return null;
  }
}
