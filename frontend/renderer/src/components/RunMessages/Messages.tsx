/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Camera, ChevronDown, Loader2 } from 'lucide-react';
import { ErrorStatusEnum } from '@ui-tars/shared/types';
import type { ConversationWithSoM } from '@/main/shared/types';

import { Button } from '@renderer/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@renderer/components/ui/alert';
import { Markdown } from '../markdown';

export const HumanTextMessage = ({ text }: { text: string }) => {
  const isSkillLog = text.startsWith('【技能日志】');

  if (isSkillLog) {
    const content = text.replace(/^【技能日志】/, '');

    return (
      <div className="my-3 ml-4">
        <div className="ml-auto max-w-[75%] rounded-lg border bg-muted/20 p-2.5">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            技能变更
          </div>
          <div className="text-xs text-foreground/80">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 ml-4 flex items-center gap-2">
      <div className="ml-auto rounded-md bg-secondary p-2.5 text-[13px] leading-5">
        {text}
      </div>
    </div>
  );
};

export const AssistantTextMessage = ({ text }: { text: string }) => {
  return (
    <div className="mb-3 flex items-center gap-2 text-[13px] leading-5">
      <div className="mr-auto rounded-md bg-sky-100 px-2.5 pb-1 pt-2.5">
        <Markdown>{text.replace(/\\n/g, '\n')}</Markdown>
      </div>
    </div>
  );
};

interface ScreenshotMessageProps {
  onClick?: () => void;
}

export const ScreenshotMessage = ({ onClick }: ScreenshotMessageProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 rounded-full px-2.5 text-[13px]"
      onClick={onClick}
    >
      <Camera className="h-4 w-4" />
      <span>截图</span>
    </Button>
  );
};

const getError = (text: string) => {
  let error: { message: string; stack: string };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.status) {
      const errorStatus = ErrorStatusEnum[parsed.status] || 'Error';
      error = {
        message: `${errorStatus}: ${parsed.message}`,
        stack: parsed.stack || text,
      };
    } else {
      error = {
        message: `Error: ${parsed.message || ''}`,
        stack: parsed.stack || text,
      };
    }
  } catch (e) {
    error = {
      message: 'Error:',
      stack: text,
    };
  }

  return error;
};

export const ErrorMessage = ({ text }: { text: string }) => {
  const error = getError(text);
  const [isExpanded, setIsExpanded] = useState(false);

  const MAX_LINE = 2;
  const stackLines = error.stack.split('\n') || [];
  const hasMoreLines = stackLines.length > MAX_LINE;
  const displayedStack = isExpanded
    ? error.stack
    : stackLines.slice(0, MAX_LINE).join('\n');

  return (
    <Alert variant="destructive" className="my-4 border-destructive/50">
      <AlertCircle />
      <AlertTitle className="break-all">{error.message}</AlertTitle>
      <AlertDescription className="break-all whitespace-pre-wrap">
        {displayedStack}
        {hasMoreLines && (
          <Button
            variant="outline"
            size="icon"
            className="absolute right-2 bottom-2 w-7 h-7 cursor-pointer hover:bg-red-50 hover:text-red-500"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronDown className={isExpanded ? 'rotate-180' : ''} />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

export const LoadingText = ({ text }: { text: string }) => {
  return (
    <div className="mt-4">
      <div className="inline-flex items-center gap-2 text-muted-foreground animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin" />
        {text}
      </div>
    </div>
  );
};

const formatActionText = (
  action?: string,
  inputs?: Record<string, unknown>,
): string => {
  if (!action) return '正在思考下一步...';
  const a = inputs ?? {};
  const truncate = (s: unknown, n = 30) => {
    const v = String(s ?? '');
    return v.length > n ? v.slice(0, n) + '…' : v;
  };
  switch (action) {
    case 'click':
    case 'left_click':
      return `点击 (${a.x}, ${a.y})`;
    case 'left_double':
    case 'double_click':
      return `双击 (${a.x}, ${a.y})`;
    case 'right_click':
    case 'right_single':
      return `右键 (${a.x}, ${a.y})`;
    case 'type':
      return `输入: "${truncate(a.text ?? a.content)}"`;
    case 'hotkey':
      return `按键: ${a.key ?? a.keys ?? ''}`;
    case 'scroll':
      return `滚动 ${a.direction ?? ''}`;
    case 'drag':
      return `拖拽 (${a.x}, ${a.y}) → (${a.x2}, ${a.y2})`;
    case 'wait':
      return '等待中...';
    case 'screenshot':
      return '截图观察...';
    case 'ocr_locate':
      return `OCR 定位文本 "${truncate(a.text)}"`;
    case 'finished':
      return '任务即将完成';
    case 'call_user':
      return '需要用户确认';
    default:
      return `执行 ${action}`;
  }
};

interface RunningIndicatorProps {
  messages: ConversationWithSoM[];
}

export const RunningIndicator = ({ messages }: RunningIndicatorProps) => {
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    startedAtRef.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const gptMessages = messages.filter((m) => m.from === 'gpt');
  const stepIndex = gptMessages.length;
  const last = gptMessages[gptMessages.length - 1];
  const pred = last?.predictionParsed?.[0];
  const actionText = formatActionText(
    pred?.action_type,
    pred?.action_inputs as Record<string, unknown> | undefined,
  );

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

  return (
    <div className="my-4 rounded-lg border-2 border-blue-400/40 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 p-3 flex items-center gap-3 shadow-sm">
      <div className="relative flex-shrink-0">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
          <span>Agent 正在执行任务</span>
          {stepIndex > 0 && (
            <span className="text-xs font-normal text-blue-700/70 dark:text-blue-300/70">
              · 第 {stepIndex} 步
            </span>
          )}
        </div>
        <div className="text-xs text-blue-700/90 dark:text-blue-300/90 mt-0.5 truncate">
          {actionText} · 已运行 {elapsedText}
        </div>
      </div>
    </div>
  );
};
