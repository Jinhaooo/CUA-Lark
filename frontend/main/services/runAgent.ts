/**
 * cua-lark · runAgent service
 *
 * 替代 UI-TARS-desktop 自带的 GUIAgent 实现：调用 cua-lark 本地后端
 *   POST  http://127.0.0.1:7878/tasks
 *   GET   http://127.0.0.1:7878/tasks/:id/stream  (SSE)
 *   DELETE http://127.0.0.1:7878/tasks/:id
 *
 * 把 SSE 事件翻译为 UI-TARS Conversation/Message store 更新，让 renderer
 * 现有的 RunMessages / Live View 等组件不感知后端协议变化。
 */
import assert from 'assert';

import { logger } from '@main/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import type { ConversationWithSoM } from '@main/shared/types';
import type { PredictionParsed } from '@ui-tars/shared/types';
import type { AppState } from '@main/store/types';

const BACKEND_URL = process.env.CUA_LARK_BACKEND || 'http://127.0.0.1:7878';

/** SSE 事件类型（与 cua-lark spec § 4.13 + § 4.18 对齐） */
type CuaLarkSseEvent =
  | { kind: 'task_started'; taskId: string; instruction: string; routedSkill: string; startedAt: number }
  | { kind: 'task_finished'; taskId: string; success: boolean; reason: string; durationMs: number; totalTokens: number }
  | { kind: 'task_failed'; taskId: string; error: { kind: string; message: string } }
  | { kind: 'task_cancelled'; taskId: string }
  | { kind: 'iteration_started'; taskId: string; iteration: number; screenshotPath: string }
  | { kind: 'thought_chunk'; taskId: string; iteration: number; delta: string }
  | { kind: 'thought_complete'; taskId: string; iteration: number; full: string; tokens: number }
  | { kind: 'thought_reset'; taskId: string; iteration: number }
  | { kind: 'tool_call'; taskId: string; iteration: number; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; taskId: string; iteration: number; success: boolean; observation: string; durationMs: number }
  | { kind: 'iteration_complete'; taskId: string; iteration: number; durationMs: number; cost: { tokens: number } }
  | { kind: 'risk_confirmation_required'; taskId: string; action: { name: string; args: unknown }; riskLevel: string; classifierReason: string }
  | { kind: 'risk_human_approved'; taskId: string }
  | { kind: 'risk_human_denied'; taskId: string }
  | { kind: 'ping' }
  | { kind: string; [key: string]: unknown };

interface IterationBuffer {
  iteration: number;
  thought: string;
  toolCall?: { name: string; args: unknown };
  observation?: string;
  durationMs?: number;
  tokens?: number;
}

export const runAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  logger.info('[cuaLark.runAgent] start, backend =', BACKEND_URL);
  const { instructions, abortController } = getState();
  assert(instructions, 'instructions is required');

  // 1. 健康检查 + POST /tasks
  let taskId: string;
  try {
    const healthRes = await fetch(`${BACKEND_URL}/health`, {
      signal: abortController?.signal,
    });
    if (!healthRes.ok) {
      throw new Error(`backend unhealthy: ${healthRes.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      errorMsg: `cua-lark 后端不可达 (${BACKEND_URL}): ${msg}\n\n请运行: pnpm --filter @cua-lark/server dev`,
    });
    return;
  }

  try {
    const submitRes = await fetch(`${BACKEND_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: instructions }),
      signal: abortController?.signal,
    });
    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '');
      throw new Error(`POST /tasks failed: ${submitRes.status} ${text}`);
    }
    const submitJson = (await submitRes.json()) as { taskId: string; status: string };
    taskId = submitJson.taskId;
    logger.info('[cuaLark.runAgent] taskId =', taskId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setState({ ...getState(), status: StatusEnum.ERROR, errorMsg: msg });
    return;
  }

  // 把"用户提交"先 push 一条 human 会话（renderer 已有但保险起见）
  const initialMessages = getState().messages || [];
  setState({
    ...getState(),
    status: StatusEnum.RUNNING,
    messages: initialMessages,
  });

  // 取消信号 → DELETE /tasks/:id
  const onAbort = () => {
    logger.info('[cuaLark.runAgent] abort signal received → DELETE /tasks/' + taskId);
    fetch(`${BACKEND_URL}/tasks/${taskId}`, { method: 'DELETE' }).catch((e) =>
      logger.warn('[cuaLark.runAgent] DELETE failed:', e),
    );
  };
  abortController?.signal.addEventListener('abort', onAbort, { once: true });

  // 2. 订阅 SSE
  let sseRes: Response;
  try {
    sseRes = await fetch(`${BACKEND_URL}/tasks/${taskId}/stream`, {
      headers: { Accept: 'text/event-stream' },
      signal: abortController?.signal,
    });
    if (!sseRes.ok || !sseRes.body) {
      throw new Error(`SSE connect failed: ${sseRes.status}`);
    }
  } catch (err) {
    if (abortController?.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    setState({ ...getState(), status: StatusEnum.ERROR, errorMsg: msg });
    return;
  }

  // 3. 流式解析 SSE 并翻译为 UI-TARS Conversation
  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentIter: IterationBuffer | null = null;
  let upsertedIter = -1;
  let upsertedIdx = -1;
  const iterStartedAt = new Map<number, number>();

  const upsertCurrentConv = () => {
    if (!currentIter) return;
    const predictionParsed: PredictionParsed[] = [
      {
        action_type: currentIter.toolCall?.name ?? '',
        action_inputs: (currentIter.toolCall?.args as PredictionParsed['action_inputs']) ?? {},
        thought: currentIter.thought,
        reflection: null,
      },
    ];
    const startedAt = iterStartedAt.get(currentIter.iteration) ?? Date.now();
    const conv: ConversationWithSoM = {
      from: 'gpt',
      value: currentIter.observation ?? '',
      predictionParsed,
      timing: {
        start: startedAt,
        end: Date.now(),
        cost: currentIter.tokens ?? 0,
      },
    } as ConversationWithSoM;

    const state = getState();
    const messages = [...(state.messages || [])];
    if (currentIter.iteration === upsertedIter && upsertedIdx >= 0 && messages[upsertedIdx]) {
      messages[upsertedIdx] = conv;
    } else {
      upsertedIter = currentIter.iteration;
      upsertedIdx = messages.length;
      messages.push(conv);
    }
    setState({ ...state, messages });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const sep = buffer.indexOf('\n\n');
        if (sep < 0) break;
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const evt = parseSseFrame(frame);
        if (!evt) continue;
        if (evt.kind === 'ping') continue;

        switch (evt.kind) {
          case 'task_started':
            logger.info('[cuaLark SSE] task_started:', (evt as Extract<CuaLarkSseEvent, { kind: 'task_started' }>).routedSkill);
            break;

          case 'iteration_started': {
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'iteration_started' }>;
            iterStartedAt.set(e.iteration, Date.now());
            currentIter = { iteration: e.iteration, thought: '' };
            upsertCurrentConv();
            break;
          }

          case 'thought_chunk': {
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'thought_chunk' }>;
            if (!currentIter || currentIter.iteration !== e.iteration) {
              currentIter = { iteration: e.iteration, thought: '' };
            }
            currentIter.thought += e.delta;
            upsertCurrentConv();
            break;
          }

          case 'thought_complete': {
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'thought_complete' }>;
            if (!currentIter || currentIter.iteration !== e.iteration) {
              currentIter = { iteration: e.iteration, thought: e.full };
            } else {
              currentIter.thought = e.full;
              currentIter.tokens = e.tokens;
            }
            upsertCurrentConv();
            break;
          }

          case 'thought_reset':
            if (currentIter) currentIter.thought = '';
            upsertCurrentConv();
            break;

          case 'tool_call': {
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'tool_call' }>;
            if (!currentIter) currentIter = { iteration: e.iteration, thought: '' };
            currentIter.toolCall = { name: e.name, args: e.args };
            upsertCurrentConv();
            break;
          }

          case 'tool_result': {
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'tool_result' }>;
            if (!currentIter) break;
            currentIter.observation = e.observation;
            currentIter.durationMs = e.durationMs;
            upsertCurrentConv();
            break;
          }

          case 'iteration_complete':
            upsertCurrentConv();
            break;

          case 'risk_confirmation_required':
            // M5 风险操作：切到 CALL_USER 状态让前端弹确认对话框
            setState({
              ...getState(),
              status: StatusEnum.CALL_USER,
              restUserData: ({
                riskConfirmation: evt as unknown as Record<string, unknown>,
              } as unknown) as AppState['restUserData'],
            });
            break;

          case 'risk_human_approved':
          case 'risk_human_denied':
            setState({ ...getState(), status: StatusEnum.RUNNING });
            break;

          case 'task_finished': {
            upsertCurrentConv();
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'task_finished' }>;
            setState({
              ...getState(),
              status: e.success ? StatusEnum.END : StatusEnum.ERROR,
              errorMsg: e.success ? null : `task_finished failed: ${e.reason}`,
            });
            logger.info('[cuaLark SSE] task_finished:', e.success, e.reason, 'tokens=', e.totalTokens);
            return;
          }

          case 'task_failed': {
            upsertCurrentConv();
            const e = evt as Extract<CuaLarkSseEvent, { kind: 'task_failed' }>;
            setState({
              ...getState(),
              status: StatusEnum.ERROR,
              errorMsg: `[${e.error?.kind}] ${e.error?.message}`,
            });
            return;
          }

          case 'task_cancelled':
            setState({ ...getState(), status: StatusEnum.USER_STOPPED });
            return;

          default:
            // skill_started / skill_finished / sse_subscriber_* / risk_low_passed 等忽略
            break;
        }
      }
    }
  } catch (err) {
    if (abortController?.signal.aborted) {
      setState({ ...getState(), status: StatusEnum.USER_STOPPED });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[cuaLark.runAgent] SSE consume error:', msg);
    setState({ ...getState(), status: StatusEnum.ERROR, errorMsg: msg });
  } finally {
    abortController?.signal.removeEventListener('abort', onAbort);
  }
};

function parseSseFrame(raw: string): CuaLarkSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colonIdx = line.indexOf(':');
    const field = colonIdx < 0 ? line : line.slice(0, colonIdx);
    const value = colonIdx < 0 ? '' : line.slice(colonIdx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
  return { kind: event, ...data } as CuaLarkSseEvent;
}
