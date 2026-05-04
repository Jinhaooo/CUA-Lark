import { ulid } from 'ulid';
import type { Context, TraceEventKind, VerifyResult, VerifySpec, VerifyStage } from '../types.js';

export type StageRunner = (spec: Exclude<VerifySpec, { kind: 'staged' }>, ctx: Context) => Promise<VerifyResult>;

const DEFAULT_STAGE_TIMEOUTS: Record<string, number> = {
  fast: 200,
  medium: 1000,
  expensive: 3000,
};

export class StagedVerifier {
  constructor(private readonly runStageSpec: StageRunner) {}

  async verify(spec: Extract<VerifySpec, { kind: 'staged' }>, ctx: Context): Promise<VerifyResult> {
    const failures: string[] = [];

    for (const stage of spec.stages) {
      const result = await this.runStage(stage, ctx);
      if (result.passed) {
        await this.writeStageTrace(ctx, 'verify_stage_pass', stage, result);
        return {
          passed: true,
          reason: `Stage ${stage.name} passed: ${result.reason}`,
        };
      }

      failures.push(`${stage.name}: ${result.reason}`);
      await this.writeStageTrace(ctx, 'verify_stage_fail', stage, result);
    }

    const reason = failures.length > 0 ? failures.join('; ') : 'No stages configured';
    await this.writeStageTrace(ctx, 'verify_all_stages_failed', { name: 'all', spec: spec.stages[0]?.spec ?? { kind: 'any', of: [] } }, {
      passed: false,
      reason,
    });

    return {
      passed: false,
      reason,
    };
  }

  private async runStage(stage: VerifyStage, ctx: Context): Promise<VerifyResult> {
    const timeoutMs = stage.maxDurationMs ?? DEFAULT_STAGE_TIMEOUTS[stage.name] ?? 1000;
    const timeout = new Promise<VerifyResult>((resolve) => {
      setTimeout(() => {
        resolve({
          passed: false,
          reason: `Stage ${stage.name} timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    });

    return Promise.race([this.runStageSpec(stage.spec, ctx), timeout]);
  }

  private async writeStageTrace(
    ctx: Context,
    kind: TraceEventKind,
    stage: VerifyStage,
    result: VerifyResult,
  ): Promise<void> {
    try {
      await ctx.trace.write({
        id: ulid(),
        test_run_id: 'staged-verify',
        kind,
        name: stage.name,
        status: result.passed ? 'passed' : 'failed',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload: {
          reason: result.reason,
          specKind: stage.spec.kind,
        },
      });
    } catch {
      // Verification outcome must not depend on trace persistence.
    }
  }
}
