import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';

export class VlmVerifier implements Verifier {
  private model: any;

  constructor(model: any) {
    this.model = model;
  }

  async run(spec: Extract<VerifySpec, { kind: 'vlm' }>, ctx: Context): Promise<VerifyResult> {
    try {
      const snapshot = await ctx.snapshot();
      
      if (!snapshot.screenshotBase64) {
        return {
          passed: false,
          reason: 'No screenshot available for VLM verification'
        };
      }

      const prompt = spec.prompt;
      const response = await this.model.chatVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image', image: snapshot.screenshotBase64 }
            ]
          }
        ]
      });

      const resultText = response.content.trim();
      
      if (resultText.startsWith('PASS')) {
        return {
          passed: true,
          reason: resultText
        };
      } else if (resultText.startsWith('FAIL')) {
        return {
          passed: false,
          reason: resultText
        };
      } else {
        return {
          passed: false,
          reason: `Unexpected model output: ${resultText}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        reason: `VLM verification failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
