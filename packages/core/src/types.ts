/**
 * CUA-Lark 核心类型定义文件
 * 
 * 本文件定义了整个框架的核心数据结构和接口，包括：
 * - 上下文对象 (Context)
 * - 技能调用和结果类型 (SkillCall, SkillRunResult)
 * - 验证规范和结果 (VerifySpec, VerifyResult)
 * - 追踪相关类型 (TraceWriter, TraceEvent)
 */

import { z } from 'zod';
import type { LarkOperator } from './operator/LarkOperator.js';
import type { HybridLocator } from './operator/HybridLocator.js';
import type { ModelClient } from './model/types.js';
import type { UiaClient } from '@cua-lark/uia-bridge';
import type { Verifier } from './verifier/Verifier.js';

/**
 * 边界框类型
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 测试用例接口定义
 */
export interface TestCase {
  name: string;
  description?: string;
  skills: SkillCall[];
  config?: Record<string, unknown>;
}

/**
 * 技能调用定义
 * 描述如何调用一个技能及其参数
 */
export interface SkillCall {
  skill: string;                    // 技能名称
  params: Record<string, unknown>;  // 技能参数
  retryPolicy?: {                   // 重试策略
    times: number;
    backoffMs: number;
  };
}

/**
 * 技能执行结果
 */
export interface SkillRunResult {
  passed: boolean;        // 是否成功
  skillName: string;      // 技能名称
  traceId: string;        // 追踪ID
  error?: SkillError;     // 错误信息（失败时）
  fallbackUsed?: string;  // 使用的fallback技能名称
}

/**
 * 技能错误类型
 */
export class SkillError extends Error {
  constructor(
    public kind: 'unknown' | 'precondition_unmet' | 'verify_failed' | 'not_found' | 'locator_failed' | 'silent_action_failure' | 'a11y_not_enabled',
    message: string
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

/**
 * 验证规范
 * 定义如何验证技能执行结果
 */
export type VerifySpec =
  | { kind: 'vlm'; prompt: string }
  | { kind: 'ocr'; contains: string | RegExp; in?: Box }
  | { kind: 'composite'; specs: VerifySpec[] }
  | { kind: 'all'; of: VerifySpec[] }
  | { kind: 'any'; of: VerifySpec[] }
  | { kind: 'pixel'; refImage: string; threshold: number }
  | { kind: 'a11y'; role: string; name: string | RegExp }
  | { kind: 'staged'; stages: VerifyStage[] };

export interface VerifyStage {
  name: string;
  spec: Exclude<VerifySpec, { kind: 'staged' }>;
  maxDurationMs?: number;
  passThreshold?: number;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  passed: boolean;    // 是否通过验证
  reason: string;     // 验证失败原因
}

/**
 * 追踪事件类型
 */
export type TraceEventKind = 
  | 'skill' 
  | 'verify' 
  | 'action' 
  | 'system'
  | 'action_intent_verify'
  | 'action_result_verify'
  | 'verify_stage_pass'
  | 'verify_stage_fail'
  | 'verify_all_stages_failed'
  | 'harness_iteration'
  | 'vlm_thought'
  | 'tool_call'
  | 'finished'
  | 'record_evidence'
  | 'task_started'
  | 'task_finished'
  | 'task_cancelled'
  | 'iteration_started'
  | 'iteration_complete'
  | 'model_request_started'
  | 'model_request_finished'
  | 'thought_complete'
  | 'tool_result'
  | 'skill_started'
  | 'skill_finished'
  | 'sse_subscriber_attached'
  | 'sse_subscriber_detached';

/**
 * 追踪事件状态
 */
export type TraceEventStatus = 'running' | 'passed' | 'failed';

/**
 * 追踪事件
 * 记录测试执行过程中的关键节点
 */
export interface TraceEvent {
  id: string;              // 事件唯一ID
  test_run_id: string;     // 测试运行ID
  parent_id?: string;      // 父事件ID（用于嵌套）
  kind: TraceEventKind;    // 事件类型
  name: string;            // 事件名称
  status: TraceEventStatus; // 事件状态
  started_at: number;      // 开始时间戳
  ended_at?: number;       // 结束时间戳
  payload?: Record<string, unknown>; // 附加数据
}

/**
 * 追踪写入器接口
 */
export interface TraceWriter {
  write(event: TraceEvent): Promise<void>;
  beginRun(): string;
  endRun(runId: string): Promise<void>;
  saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string>;
}

/**
 * OCR识别结果Token
 */
export interface OcrToken {
  text: string;                          // 识别的文本内容
  box: [number, number, number, number]; // 文本位置 [x1, y1, x2, y2]
  confidence: number;                    // 置信度 (0-1)
}

/**
 * OCR客户端接口
 * 提供文字识别和定位能力
 */
export interface OcrClient {
  /**
   * 识别图片中的文字
   * @param image - 图片Buffer
   * @param region - 可选的识别区域
   * @returns 识别到的文本Token列表
   */
  recognize(
    image: Buffer,
    region?: { x1: number; y1: number; x2: number; y2: number }
  ): Promise<OcrToken[]>;

  /**
   * 在图片中定位目标文本
   * @param image - 图片Buffer
   * @param target - 目标文本
   * @returns 文本位置，未找到返回null
   */
  locate(image: Buffer, target: string): Promise<{ x1: number; y1: number; x2: number; y2: number } | null>;
}

/**
 * 执行上下文
 * 贯穿整个技能执行过程的上下文对象
 */
export interface Context {
  operator: LarkOperator;  // 操作器（控制飞书客户端）
  agent: any;              // GUIAgent实例
  model: ModelClient;      // 模型客户端（VLM调用）
  config: Record<string, unknown>; // 配置
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  trace: TraceWriter;      // 追踪写入器
  ocr?: OcrClient;         // OCR客户端（可选）
  uia?: UiaClient | null;   // UIA客户端（可选）
  locator?: HybridLocator;  // 混合定位器（可选）
  verifier?: Verifier;      // 验证器（可选）
  __fallbackDepth?: number; // Fallback深度（内部使用）
}

/**
 * 技能注册表接口
 */
export interface SkillRegistry {
  register(skill: any): void;
  get(name: string): any;
  list(): any[];
  loadFromFs(rootDir: string): Promise<void>;
}
