import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';

export class VlmVerifier implements Verifier {
  async run(spec: Extract<VerifySpec, { kind: 'vlm' }>, ctx: Context): Promise<VerifyResult> {
    return this.verify(spec, ctx);
  }

  async verify(spec: Extract<VerifySpec, { kind: 'vlm' }>, ctx: Context): Promise<VerifyResult> {
    try {
      const screenshotBase64 = await this.getScreenshotBase64(ctx);
      if (!screenshotBase64) {
        return {
          passed: false,
          reason: 'No screenshot available for VLM verification',
        };
      }

      const resp = await ctx.model.chatVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: spec.prompt },
              {
                type: 'image_url',
                image_url: {
                  url: screenshotBase64.startsWith('data:')
                    ? screenshotBase64
                    : 'data:image/png;base64,' + screenshotBase64,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      });

      try {
        const parsed = JSON.parse(resp.content);
        return {
          passed: parsed.passed ?? false,
          reason: parsed.reason ?? '',
        };
      } catch {
        const content = resp.content.trim();
        const passLike = /\bpass(ed)?\b|通过|正确|匹配|可见/i.test(content);
        const failLike = /\bfail(ed)?\b|不通过|错误|不匹配|不可见/i.test(content);
        if (passLike && !failLike) {
          return { passed: true, reason: content };
        }
        return { passed: false, reason: content || 'VLM response parse failed' };
      }
    } catch (error) {
      return {
        passed: false,
        reason: error instanceof Error ? error.message : 'VLM verification failed',
      };
    }
  }

  private async getScreenshotBase64(ctx: Context): Promise<string | null> {
    if (ctx.operator && typeof ctx.operator.screenshot === 'function') {
      const shot = await ctx.operator.screenshot();
      return shot?.base64 ?? null;
    }

    const snapshotFn = (ctx as any).snapshot;
    if (typeof snapshotFn === 'function') {
      const snapshot = await snapshotFn();
      return snapshot?.screenshotBase64 ?? null;
    }

    return null;
  }
}
