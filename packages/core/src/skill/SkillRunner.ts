import { SkillError } from '../types.js';
import type { SkillRegistry, TraceWriter, Context, SkillCall, SkillRunResult } from '../types.js';
import { Verifier } from '../verifier/Verifier.js';
import { ulid } from 'ulid';
import type { ActionVerifier } from '../operator/ActionVerifier.js';

export class SkillRunner {
  private registry: SkillRegistry;
  private verifier: Verifier;
  private trace: TraceWriter;
  private actionVerifier: ActionVerifier | null = null;

  constructor(registry: SkillRegistry, verifier: Verifier, trace: TraceWriter) {
    this.registry = registry;
    this.verifier = verifier;
    this.trace = trace;
  }

  setActionVerifier(actionVerifier: ActionVerifier | null): void {
    this.actionVerifier = actionVerifier;
  }

  async run(call: SkillCall, ctx: Context, parentTraceId?: string): Promise<SkillRunResult> {
    const skill = this.registry.get(call.skill);
    if (!skill) {
      throw new SkillError('unknown', `Skill not found: ${call.skill}`);
    }

    const traceId = ulid();
    const testRunId = ctx.trace.beginRun();

    await this.trace.write({
      id: traceId,
      test_run_id: testRunId,
      parent_id: parentTraceId,
      kind: 'skill',
      name: skill.name,
      status: 'running',
      started_at: Date.now(),
      payload: { params: call.params }
    });

    try {
      const maxRetries = call.retryPolicy?.times || 1;
      const backoffMs = call.retryPolicy?.backoffMs || 0;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (skill.preconditions) {
            for (const precondition of skill.preconditions) {
              const result = await precondition(ctx);
              if (!result) {
                throw new SkillError('precondition_unmet', 'Precondition failed');
              }
            }
          }

          const actionVerificationEnabled = this.enableActionVerificationIfAvailable(skill, ctx);
          let result: unknown;
          try {
            result = await skill.execute(ctx, call.params);
          } finally {
            if (actionVerificationEnabled) {
              ctx.operator.setActionVerifyEnabled(false);
            }
          }

          if (skill.verify) {
            const verifyResult = await skill.verify(ctx, call.params, result);
            await this.trace.write({
              id: ulid(),
              test_run_id: testRunId,
              parent_id: traceId,
              kind: 'verify',
              name: `${skill.name}_verify`,
              status: verifyResult.passed ? 'passed' : 'failed',
              started_at: Date.now(),
              ended_at: Date.now(),
              payload: { result: verifyResult }
            });

            if (!verifyResult.passed) {
              throw new SkillError('verify_failed', verifyResult.reason);
            }
          }

          await this.trace.write({
            id: ulid(),
            test_run_id: testRunId,
            parent_id: traceId,
            kind: 'skill',
            name: skill.name,
            status: 'passed',
            started_at: Date.now(),
            ended_at: Date.now(),
            payload: { result }
          });

          return {
            passed: true,
            skillName: skill.name,
            traceId
          };
        } catch (error) {
          if (attempt === maxRetries - 1) {
            if (skill.fallback && !ctx.__fallbackDepth) {
              ctx.logger.warn(`Falling back to ${skill.fallback}`);

              await this.trace.write({
                id: ulid(),
                test_run_id: testRunId,
                parent_id: traceId,
                kind: 'skill',
                name: skill.name,
                status: 'failed',
                started_at: Date.now(),
                ended_at: Date.now(),
                payload: { error: error instanceof Error ? error.message : String(error), fallback: skill.fallback }
              });

              const fallbackCtx = { ...ctx, __fallbackDepth: 1 };
              const fallbackResult = await this.run(
                { skill: skill.fallback, params: call.params },
                fallbackCtx,
                traceId
              );

              return {
                ...fallbackResult,
                fallbackUsed: skill.fallback
              };
            } else {
              throw error;
            }
          }

          if (backoffMs > 0) {
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      throw new SkillError('unknown', 'Skill execution failed');
    } catch (error) {
      if (error instanceof SkillError && error.message.startsWith('Skill not found:')) {
        throw error;
      }
      await this.trace.write({
        id: ulid(),
        test_run_id: testRunId,
        parent_id: traceId,
        kind: 'skill',
        name: skill.name,
        status: 'failed',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload: { error: error instanceof Error ? error.message : String(error) }
      });

      if (error instanceof SkillError) {
        return {
          passed: false,
          skillName: skill.name,
          error,
          traceId
        };
      } else {
        return {
          passed: false,
          skillName: skill.name,
          error: new SkillError('unknown', error instanceof Error ? error.message : String(error)),
          traceId
        };
      }
    } finally {
      await this.trace.endRun(testRunId);
    }
  }

  private shouldVerifyActions(skill: { verify_actions?: boolean; kind: string }): boolean {
    if (skill.verify_actions !== undefined) {
      return skill.verify_actions;
    }

    return skill.kind === 'agent_driven';
  }

  private enableActionVerificationIfAvailable(skill: { verify_actions?: boolean; kind: string }, ctx: Context): boolean {
    if (!this.shouldVerifyActions(skill) || !this.actionVerifier || !ctx.operator) {
      return false;
    }

    if (
      typeof ctx.operator.setActionVerifier !== 'function' ||
      typeof ctx.operator.setActionVerifyEnabled !== 'function'
    ) {
      return false;
    }

    ctx.operator.setActionVerifier(this.actionVerifier);
    ctx.operator.setActionVerifyEnabled(true);
    return true;
  }
}
