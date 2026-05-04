/**
 * SkillRunner - 技能执行器
 * 
 * 负责执行技能，处理：
 * - 技能查找
 * - 前置条件检查
 * - 执行重试逻辑
 * - Fallback机制
 * - 结果验证
 * - 追踪记录
 * - 动作级验证集成
 */

import { SkillError } from '../types.js';
import type { SkillRegistry, TraceWriter, Context, SkillCall, SkillRunResult } from '../types.js';
import { Verifier } from '../verifier/Verifier.js';
import { ulid } from 'ulid';
import type { ActionVerifier } from '../operator/ActionVerifier.js';
import { ActionIntentLowConfidence, SilentActionFailure } from '../operator/ActionVerifier.js';
import type { RobustnessConfig } from '../suite/RobustnessConfigLoader.js';

export class SkillRunner {
  private registry: SkillRegistry;
  private verifier: Verifier;
  private trace: TraceWriter;
  private actionVerifier: ActionVerifier | null = null;
  private robustnessConfig: RobustnessConfig | null = null;

  /**
   * 构造函数
   * @param registry - 技能注册表
   * @param verifier - 验证器
   * @param trace - 追踪写入器
   * @param robustnessConfig - 鲁棒性配置
   */
  constructor(registry: SkillRegistry, verifier: Verifier, trace: TraceWriter, robustnessConfig?: RobustnessConfig) {
    this.registry = registry;
    this.verifier = verifier;
    this.trace = trace;
    this.robustnessConfig = robustnessConfig || null;
  }

  /**
   * 设置动作验证器
   * @param actionVerifier - ActionVerifier实例
   */
  setActionVerifier(actionVerifier: ActionVerifier | null): void {
    this.actionVerifier = actionVerifier;
  }

  /**
   * 执行技能
   * 
   * @param call - 技能调用信息
   * @param ctx - 执行上下文
   * @param parentTraceId - 父追踪ID（用于嵌套调用）
   * @returns 执行结果
   */
  async run(call: SkillCall, ctx: Context, parentTraceId?: string): Promise<SkillRunResult> {
    // 查找技能
    const skill = this.registry.get(call.skill);
    if (!skill) {
      throw new SkillError('unknown', `Skill not found: ${call.skill}`);
    }

    // 生成追踪ID
    const traceId = ulid();
    const testRunId = ctx.trace.beginRun();

    // 记录技能开始事件
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
      // 检查失败注入
      this.checkForceFail(skill.name);

      // 获取重试策略配置
      const maxRetries = call.retryPolicy?.times || 1;
      const backoffMs = call.retryPolicy?.backoffMs || 0;

      // 执行重试循环
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // 检查前置条件
          if (skill.preconditions) {
            for (const precondition of skill.preconditions) {
              const result = await precondition(ctx);
              if (!result) {
                throw new SkillError('precondition_unmet', 'Precondition failed');
              }
            }
          }

          // 判断是否需要动作级验证
          const shouldVerifyActions = this.shouldVerifyActions(skill);
          if (shouldVerifyActions && this.actionVerifier && ctx.operator) {
            ctx.operator.setActionVerifier(this.actionVerifier);
            ctx.operator.setActionVerifyEnabled(true);
            ctx.operator.setTraceContext({
              trace: ctx.trace,
              testRunId: testRunId,
              parentTraceId: traceId,
            });
          }

          // 执行技能
          const result = await skill.execute(ctx, call.params);

          // 关闭动作级验证
          if (shouldVerifyActions && ctx.operator) {
            ctx.operator.setActionVerifyEnabled(false);
            ctx.operator.setTraceContext(null);
          }

          // 验证技能结果
          if (skill.verify) {
            const verifyResult = await skill.verify(ctx, call.params, result);
            
            // 记录验证事件
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

          // 记录技能成功事件
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
          // 最后一次尝试失败，处理fallback
          if (attempt === maxRetries - 1) {
            // 检查是否有fallback并且没有达到fallback深度限制
            if (skill.fallback && !ctx.__fallbackDepth) {
              ctx.logger.warn(`Falling back to ${skill.fallback}`);
              
              // 记录fallback事件
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

              // 记录fallback_invoked事件，用于可视化
              await this.trace.write({
                id: ulid(),
                test_run_id: testRunId,
                parent_id: traceId,
                kind: 'skill',
                name: `${skill.name}->fallback->${skill.fallback}`,
                status: 'failed',
                started_at: Date.now(),
                ended_at: Date.now(),
                payload: { phase: 'fallback_invoked', original: skill.name, target: skill.fallback, originalError: error instanceof Error ? error.message : String(error) }
              });

              // 执行fallback技能，设置fallback深度
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
              // 没有fallback或已达到深度限制，抛出原始错误
              throw error;
            }
          }

          // 重试前等待
          if (backoffMs > 0) {
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      // 理论上不会到达这里
      throw new SkillError('unknown', 'Skill execution failed');
    } catch (error) {
      if (error instanceof SkillError && error.message.startsWith('Skill not found:')) {
        throw error;
      }
      
      // 记录技能失败事件
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

      // 封装错误并返回
      let skillError: SkillError;
      if (error instanceof SkillError) {
        skillError = error;
      } else if (error instanceof ActionIntentLowConfidence) {
        skillError = new SkillError('locator_failed', error.message);
      } else if (error instanceof SilentActionFailure) {
        skillError = new SkillError('silent_action_failure', error.message);
      } else {
        skillError = new SkillError('unknown', error instanceof Error ? error.message : String(error));
      }

      return {
        passed: false,
        skillName: skill.name,
        error: skillError,
        traceId
      };
    } finally {
      await this.trace.endRun(testRunId);
    }
  }

  /**
   * 判断是否应该启用动作级验证
   * 
   * 优先级：
   * 1. 技能显式配置verifyActions
   * 2. 根据robustness配置和技能类型决定
   * 
   * @param skill - 技能对象
   * @returns 是否启用动作级验证
   */
  private shouldVerifyActions(skill: { verifyActions?: boolean; kind: string }): boolean {
    if (skill.verifyActions !== undefined) {
      return skill.verifyActions;
    }

    const defaultEnabled = this.robustnessConfig?.action_verify.default_for_agent_driven ?? true;
    return skill.kind === 'agent_driven' && defaultEnabled;
  }

  /**
   * 检查失败注入
   * 
   * 根据环境变量 CUA_FORCE_FAIL 判断是否强制失败
   * 
   * @param skillName - 技能名称
   */
  private checkForceFail(skillName: string): void {
    const forceFailEnv = process.env.CUA_FORCE_FAIL;
    if (!forceFailEnv) return;

    const forceFailSkills = forceFailEnv.split(',').map(s => s.trim());
    if (forceFailSkills.includes(skillName)) {
      throw new SkillError('locator_failed', `forced by CUA_FORCE_FAIL`);
    }
  }
}