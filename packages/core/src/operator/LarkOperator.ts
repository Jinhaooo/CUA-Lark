/**
 * LarkOperator - 飞书客户端操作器
 * 
 * 封装对飞书桌面客户端的所有操作，包括：
 * - 截图
 * - 鼠标操作（点击、拖拽等）
 * - 键盘操作（输入、快捷键）
 * - 文本定位（OCR支持）
 * - 动作验证（前置意图校验 + 后置结果校验）
 */

import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { keyboard, Key, mouse, screen } from '@computer-use/nut-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  ScreenshotOutput,
  ExecuteParams,
  ExecuteOutput,
} from '@ui-tars/sdk/core';
import type { Box, OcrClient, TraceWriter } from '../types.js';
import type { ActionVerifier, PredictionParsed, ActionVerifyConfig } from './ActionVerifier.js';
import type { HybridLocator } from './HybridLocator.js';
import { ActionIntentLowConfidence, SilentActionFailure } from './ActionVerifier.js';
import type { UiaClient, UiaElement, UiaRole } from '@cua-lark/uia-bridge';
import { ulid } from 'ulid';
import type { ToolRegistry, ToolResult } from '../tools/types.js';

const execFileAsync = promisify(execFile);

export interface SimpleExecuteParams {
  action_type: string;
  action_inputs?: Record<string, unknown>;
}

export class LarkOperator {
  /**
   * 支持的动作空间定义
   * 定义了GUIAgent可以执行的所有动作及其参数格式
   */
  static MANUAL = {
    ACTION_SPACES: [
      "click(start_box='[x1, y1, x2, y2]')",
      "left_double(start_box='[x1, y1, x2, y2]')",
      "right_single(start_box='[x1, y1, x2, y2]')",
      "drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')",
      "hotkey(key='')",
      "type(content='') #If you want to submit your input, use \"\\n\" at the end of `content`.",
      "scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')",
      'wait() #Sleep for 5s and take a screenshot to check for any changes.',
      'finished()',
      "call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.",
    ] as string[],
  };

  private nutjs = new NutJSOperator();  // 底层操作器
  private executingAction = false;      // 是否正在执行动作
  private ocrClient: OcrClient | null = null;  // OCR客户端
  public find: HybridLocator | null = null;
  private uiaClient: UiaClient | null = null;
  private actionVerifier: ActionVerifier | null = null;  // 动作验证器
  private actionVerifyEnabled = false;  // 是否启用动作验证
  private traceContext: { trace: TraceWriter; testRunId: string; parentTraceId: string } | null = null;
  private toolRegistry: ToolRegistry | null = null;  // ToolRegistry (v1.3 Harness)

  /**
   * 截图
   * @returns 截图输出（base64编码）
   */
  async screenshot(): Promise<ScreenshotOutput> {
    return this.nutjs.screenshot();
  }

  /**
   * 执行动作（核心方法）
   * 
   * 执行GUIAgent生成的动作，支持：
   * - 前置意图验证（验证目标元素可见）
   * - 动作执行
   * - 后置结果验证（验证动作效果）
   * 
   * @param params - 动作参数
   * @returns 执行结果
   */
  async execute(params: ExecuteParams | SimpleExecuteParams): Promise<ExecuteOutput> {
    this.executingAction = true;
    let beforeShot: Buffer | null = null;

    try {
      const fullParams = await this.toExecuteParams(params);
      // 解析动作预测
      const parsedPrediction = this.parsePrediction(fullParams);

      // 前置意图验证
      if (this.actionVerifier && this.actionVerifyEnabled) {
        beforeShot = await this.captureScreenshot();
        await this.verifyBeforeAction(parsedPrediction, beforeShot);
      }

      // 执行动作
      const normalizedParams = normalizeExecuteParams(fullParams);
      const result = await this.executeWithTypeFallback(normalizedParams, parsedPrediction);

      // 后置结果验证
      if (this.actionVerifier && this.actionVerifyEnabled && beforeShot) {
        const afterShot = await this.captureScreenshot();
        await this.verifyAfterAction(parsedPrediction, beforeShot, afterShot);
      }

      return result;
    } finally {
      this.executingAction = false;
    }
  }

  private async toExecuteParams(params: ExecuteParams | SimpleExecuteParams): Promise<ExecuteParams> {
    if ('parsedPrediction' in params) {
      return params;
    }

    return {
      prediction: '',
      parsedPrediction: {
        action_type: params.action_type,
        action_inputs: params.action_inputs ?? {},
      },
      screenWidth: await screen.width(),
      screenHeight: await screen.height(),
      scaleFactor: 1,
    } as ExecuteParams;
  }

  private async executeWithTypeFallback(params: ExecuteParams, parsedPrediction: PredictionParsed): Promise<ExecuteOutput> {
    try {
      return await this.nutjs.execute(params);
    } catch (error) {
      if (parsedPrediction.action_type !== 'type' || !isClipboardReadFailure(error)) {
        throw error;
      }

      const content = parsedPrediction.action_inputs?.content;
      if (typeof content !== 'string') {
        throw error;
      }

      await pasteTextViaClipboard(content);
      return {} as ExecuteOutput;
    }
  }

  /**
   * 解析动作预测参数
   * @param params - 执行参数
   * @returns 解析后的预测对象
   */
  private parsePrediction(params: ExecuteParams): PredictionParsed {
    const actionType = params.parsedPrediction.action_type ?? '';
    const actionInputs = params.parsedPrediction.action_inputs ?? {};
    const thought = params.prediction ?? '';

    return { action_type: actionType, action_inputs: actionInputs, thought };
  }

  /**
   * 捕获截图为Buffer
   * @returns 图片Buffer
   */
  private async captureScreenshot(): Promise<Buffer> {
    const screenshot = await this.screenshot();
    return Buffer.from(screenshot.base64, 'base64');
  }

  /**
   * 前置意图验证
   * 在执行动作前验证目标元素是否唯一可见
   * 
   * @param parsedPrediction - 解析后的动作预测
   * @param beforeShot - 动作前截图
   */
  private async verifyBeforeAction(parsedPrediction: PredictionParsed, beforeShot: Buffer): Promise<void> {
    if (!this.actionVerifier) return;

    // 豁免的动作类型（无需验证）
    if (this.actionVerifier.isExempt(parsedPrediction.action_type)) {
      return;
    }

    const config = this.getActionVerifyConfig();
    const result = await this.actionVerifier.beforeAction(parsedPrediction, beforeShot);

    // 记录意图验证trace
    if (this.traceContext) {
      await this.traceContext.trace.write({
        id: ulid(),
        test_run_id: this.traceContext.testRunId,
        parent_id: this.traceContext.parentTraceId,
        kind: 'action_intent_verify',
        name: `intent_verify_${parsedPrediction.action_type}`,
        status: result.uniquely_visible ? 'passed' : 'failed',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload: {
          confidence: result.confidence,
          reasoning: result.reasoning,
          action_type: parsedPrediction.action_type,
          uniquely_visible: result.uniquely_visible,
        },
      });
    }

    // 如果目标元素不唯一可见且置信度高于阈值，抛出错误
    if (!result.uniquely_visible && result.confidence >= config.intent_threshold) {
      throw new ActionIntentLowConfidence(result.confidence, result.reasoning);
    }
  }

  /**
   * 后置结果验证
   * 在执行动作后验证UI是否发生了预期变化
   * 
   * @param parsedPrediction - 解析后的动作预测
   * @param beforeShot - 动作前截图
   * @param afterShot - 动作后截图
   */
  private async verifyAfterAction(
    parsedPrediction: PredictionParsed,
    beforeShot: Buffer,
    afterShot: Buffer
  ): Promise<void> {
    if (!this.actionVerifier) return;

    if (this.actionVerifier.isExempt(parsedPrediction.action_type)) {
      return;
    }

    const config = this.getActionVerifyConfig();
    const result = await this.actionVerifier.afterAction(parsedPrediction, beforeShot, afterShot);

    // 记录结果验证trace
    if (this.traceContext) {
      await this.traceContext.trace.write({
        id: ulid(),
        test_run_id: this.traceContext.testRunId,
        parent_id: this.traceContext.parentTraceId,
        kind: 'action_result_verify',
        name: `result_verify_${parsedPrediction.action_type}`,
        status: result.as_expected ? 'passed' : 'failed',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload: {
          confidence: result.confidence,
          reasoning: result.reasoning,
          as_expected: result.as_expected,
        },
      });
    }

    // 如果结果不符合预期且置信度高于阈值，抛出错误
    if (!result.as_expected && result.confidence >= config.result_threshold) {
      throw new SilentActionFailure(result.confidence, result.reasoning);
    }
  }

  /**
   * 获取动作验证配置
   * @returns 验证配置
   */
  private getActionVerifyConfig(): ActionVerifyConfig {
    return {
      intent_threshold: 0.7,
      result_threshold: 0.6,
      exempt_action_types: ['wait', 'finished', 'call_user', 'user_stop', 'hotkey'],
    };
  }

  /**
   * 检查是否正在执行动作
   * @returns 是否正在执行
   */
  isExecuting(): boolean {
    return this.executingAction;
  }

  /**
   * 获取鼠标位置
   * @returns 鼠标坐标
   */
  async getMousePosition(): Promise<{ x: number; y: number }> {
    const position = await mouse.getPosition();
    return { x: position.x, y: position.y };
  }

  /**
   * 设置OCR客户端
   * @param ocrClient - OCR客户端实例
   */
  setOcrClient(ocrClient: OcrClient | null): void {
    this.ocrClient = ocrClient;
  }

  setLocator(locator: HybridLocator | null): void {
    this.find = locator;
  }

  setUiaClient(uiaClient: UiaClient | null): void {
    this.uiaClient = uiaClient;
  }

  /**
   * 设置动作验证器
   * @param verifier - ActionVerifier实例
   */
  setActionVerifier(verifier: ActionVerifier | null): void {
    this.actionVerifier = verifier;
  }

  /**
   * 启用/禁用动作验证
   * @param enabled - 是否启用
   */
  setActionVerifyEnabled(enabled: boolean): void {
    this.actionVerifyEnabled = enabled;
  }

  /**
   * 设置追踪上下文
   * @param ctx - 追踪上下文
   */
  setTraceContext(ctx: { trace: TraceWriter; testRunId: string; parentTraceId: string } | null): void {
    this.traceContext = ctx;
  }

  /**
   * 通过文本定位UI元素（使用OCR）
   * @param text - 目标文本
   * @returns 元素位置Box，未找到返回null
   */
  async findByText(text: string): Promise<Box | null> {
    if (!this.ocrClient) {
      return null;
    }

    try {
      const screenshot = await this.screenshot();
      const imageBuffer = Buffer.from(screenshot.base64, 'base64');
      const result = await this.ocrClient.locate(imageBuffer, text);

      if (!result) {
        return null;
      }

      return {
        x: result.x1,
        y: result.y1,
        width: result.x2 - result.x1,
        height: result.y2 - result.y1,
      };
    } catch {
      return null;
    }
  }

  /**
   * 通过辅助功能定位UI元素（预留接口）
   * @param role - 角色
   * @param name - 名称
   * @returns 元素位置Box
   */
  async findByA11y(role: string, name: string): Promise<Box | null> {
    return null;
  }

  async findAll(spec: { role: UiaRole; name?: string | RegExp }): Promise<UiaElement[]> {
    return this.uiaClient?.findAll(spec) ?? [];
  }

  /**
   * 等待文本出现
   * @param text - 目标文本
   * @param opts - 选项（超时时间）
   */
  async waitForVisible(text: string, opts?: { timeoutMs?: number }): Promise<void> {
    if (!this.ocrClient) {
      throw new NotImplementedError('waitForVisible requires OCR, available from M3');
    }

    const timeoutMs = opts?.timeoutMs ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const box = await this.findByText(text);
      if (box) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`waitForVisible timed out after ${timeoutMs}ms for text: ${text}`);
  }

  /**
   * 执行工具调用（v1.3 Harness 模式）
   * 
   * 根据工具名称和参数执行对应的工具
   * 
   * @param toolCall - 工具调用对象，包含工具名称和参数
   * @returns 工具执行结果
   */
  async executeToolCall(toolCall: { name: string; args: unknown }, harnessContext?: ReturnType<LarkOperator['createHarnessContext']>): Promise<ToolResult> {
    if (!this.toolRegistry) {
      throw new Error('ToolRegistry not set. Call setToolRegistry() first.');
    }

    const tool = this.toolRegistry.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        observation: `Unknown tool: ${toolCall.name}`,
        error: { kind: 'unknown_tool', message: `Tool '${toolCall.name}' not found in registry` },
      };
    }

    try {
      const args = tool.argsSchema.parse(toolCall.args);
      return await tool.execute(harnessContext ?? this.createHarnessContext(), args);
    } catch (error) {
      if (error instanceof Error && 'issues' in (error as any)) {
        return {
          success: false,
          observation: `Invalid tool arguments for ${toolCall.name}: ${error.message}`,
          error: { kind: 'invalid_tool_args', message: error.message },
        };
      }
      throw error;
    }
  }

  /**
   * 设置 ToolRegistry
   * @param registry - ToolRegistry 实例
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  private createHarnessContext() {
    return {
      operator: this,
      model: {} as any,
      ocr: this.ocrClient ?? undefined,
      uia: this.uiaClient ?? undefined,
      trace: {} as any,
      testRunId: '',
      parentTraceId: '',
      iteration: 0,
      params: {},
      config: {
        maxLoopIterations: 30,
        maxTokensPerSkill: 120000,
        messageHistoryLimit: 5,
        loopDetectionThreshold: 3,
      },
      logger: {
        info: (...a: unknown[]) => console.log(...a),
        warn: (...a: unknown[]) => console.warn(...a),
        error: (...a: unknown[]) => console.error(...a),
      },
    };
  }
}

/**
 * 规范化执行参数
 * 处理start_box和end_box的格式转换
 */
function normalizeExecuteParams(params: ExecuteParams): ExecuteParams {
  const actionInputs = params.parsedPrediction.action_inputs ?? {};
  const startBox = normalizeBoxInput(actionInputs.start_box, params) ?? normalizePredictionBox(params.prediction, params);
  const endBox = normalizeBoxInput(actionInputs.end_box, params);
  if (!startBox && !endBox) {
    return params;
  }

  return {
    ...params,
    parsedPrediction: {
      ...params.parsedPrediction,
      action_inputs: {
        ...actionInputs,
        ...(startBox ? { start_box: startBox } : {}),
        ...(endBox ? { end_box: endBox } : {}),
      },
    },
  };
}

/**
 * 规范化Box输入
 */
function normalizeBoxInput(input: unknown, params: ExecuteParams): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const coords = parseBoxLike(input);
  if (!coords) {
    return null;
  }

  return formatBox(coords, params);
}

/**
 * 从预测字符串中提取Box
 */
function normalizePredictionBox(prediction: string, params: ExecuteParams): string | null {
  // 从start_box='...'格式提取
  for (const match of prediction.matchAll(/start_box\s*=\s*['"]([^'"]+)['"]/gi)) {
    const box = parseBoxLike(match[1]!);
    if (box) {
      return formatBox(box, params);
    }
  }

  // 从<point>标签提取
  const pointTag = prediction.match(/<point>\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*<\/point>/i);
  if (pointTag) {
    return formatBox(toPointBox(Number(pointTag[1]), Number(pointTag[2])), params);
  }

  // 从point:{x,y}格式提取
  const objectPoint = prediction.match(
    /point\s*:\s*\{\s*x\s*:\s*([+-]?\d+(?:\.\d+)?)\s*,?\s*(?:y\s*:\s*)?([+-]?\d+(?:\.\d+)?)\s*\}/i,
  );
  if (objectPoint) {
    return formatBox(toPointBox(Number(objectPoint[1]), Number(objectPoint[2])), params);
  }

  return null;
}

/**
 * 解析Box格式字符串
 */
function parseBoxLike(input: string): [number, number, number, number] | null {
  // 过滤无效格式
  if (/\b[xy][1-4]\b/i.test(input) || /[a-wz]|null|nan/i.test(input)) {
    return null;
  }

  const numbers = input.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length !== 2 && numbers.length !== 4) {
    return null;
  }

  if (!numbers.every(Number.isFinite)) {
    return null;
  }

  const [x1, y1, x2 = x1, y2 = y1] = numbers;
  return [x1!, y1!, x2!, y2!];
}

/**
 * 将点转换为Box
 */
function toPointBox(x: number, y: number): [number, number, number, number] {
  return [x, y, x, y];
}

/**
 * 格式化Box为字符串
 */
function formatBox(box: [number, number, number, number], params: ExecuteParams): string {
  const safeBox = applyOptionalSafeBounds(box, params);
  const [x1, y1, x2, y2] = safeBox;
  const normalized = [
    normalizeCoord(x1, params.screenWidth),
    normalizeCoord(y1, params.screenHeight),
    normalizeCoord(x2, params.screenWidth),
    normalizeCoord(y2, params.screenHeight),
  ].map(formatCoord).join(', ');
  return `[${normalized}]`;
}

/**
 * 格式化坐标值
 */
function formatCoord(value: number): string {
  return Number(value.toFixed(6)).toString();
}

/**
 * 规范化坐标（处理相对坐标和绝对坐标）
 */
function normalizeCoord(value: number, screenSize: number): number {
  if (value <= 1) {
    return value; // 已经是相对坐标
  }
  return value <= 1000 ? value / 1000 : value / screenSize;
}

/**
 * 应用安全边界限制
 */
function applyOptionalSafeBounds(
  box: [number, number, number, number],
  params: ExecuteParams,
): [number, number, number, number] {
  const bounds = parseSafeBounds(process.env.CUA_LARK_SAFE_BOUNDS);
  if (!bounds) {
    return box;
  }

  const toScreenX = (value: number) => normalizeCoord(value, params.screenWidth) * params.screenWidth;
  const toScreenY = (value: number) => normalizeCoord(value, params.screenHeight) * params.screenHeight;
  const fromScreenX = (value: number) => value / params.screenWidth;
  const fromScreenY = (value: number) => value / params.screenHeight;

  return [
    fromScreenX(clamp(toScreenX(box[0]), bounds.left, bounds.right)),
    fromScreenY(clamp(toScreenY(box[1]), bounds.top, bounds.bottom)),
    fromScreenX(clamp(toScreenX(box[2]), bounds.left, bounds.right)),
    fromScreenY(clamp(toScreenY(box[3]), bounds.top, bounds.bottom)),
  ];
}

/**
 * 解析安全边界环境变量
 */
function parseSafeBounds(value: string | undefined): { left: number; top: number; right: number; bottom: number } | null {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    return null;
  }

  const [left, top, right, bottom] = parts;
  if (left! >= right! || top! >= bottom!) {
    return null;
  }

  return { left: left!, top: top!, right: right!, bottom: bottom! };
}

/**
 * 数值限制函数
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isClipboardReadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error
    ? String((error as { stderr?: unknown }).stderr ?? '')
    : '';
  return /clipboardy|clipboard_x86_64|Could not paste from clipboard|code: 1168|找不到元素/i.test(`${message}\n${stderr}`);
}

async function pasteTextViaClipboard(content: string): Promise<void> {
  await setClipboardText(content);
  await keyboard.pressKey(Key.LeftControl, Key.V);
  await keyboard.releaseKey(Key.LeftControl, Key.V);
}

async function setClipboardText(content: string): Promise<void> {
  if (process.platform === 'win32') {
    const valueBase64 = Buffer.from(content, 'utf8').toString('base64');
    const script = `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${valueBase64}')))`;
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      { windowsHide: true },
    );
    return;
  }

  await keyboard.type(content);
}

/**
 * 未实现错误
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
