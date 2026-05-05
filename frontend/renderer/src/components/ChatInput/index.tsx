/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { StatusEnum } from '@ui-tars/shared/types';

import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { Button } from '@renderer/components/ui/button';
// import { useScreenRecord } from '@renderer/hooks/useScreenRecord';
import { api } from '@renderer/api';

import { Play, Send, Square, Loader2, Sparkles, Plus } from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
import { useSession } from '@renderer/hooks/useSession';

import { Operator } from '@main/store/types';
import { useSetting } from '../../hooks/useSetting';
import { classifyCuaIntent } from '../../utils/intent';

const ChatInput = ({
  operator,
  sessionId,
  disabled,
  checkBeforeRun,
}: {
  operator: Operator;
  sessionId: string;
  disabled: boolean;
  checkBeforeRun?: () => Promise<boolean>;
}) => {
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();
  const [localInstructions, setLocalInstructions] = useState('');
  const { run, stopAgentRuning } = useRunAgent();
  const { getSession, updateSession, chatMessages } = useSession();
  const { settings, updateSetting } = useSetting();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [autoSkillSummary, setAutoSkillSummary] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ id: string; name: string; kind: 'image' | 'video' | 'document' }>
  >([]);
  const running = status === StatusEnum.RUNNING;
  const maxImageUploadSize = 100 * 1024 * 1024;
  const maxVideoUploadSize = 500 * 1024 * 1024;
  const maxImageCount = 5;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (status === StatusEnum.INIT) {
      return;
    }
  }, [status]);

  useEffect(() => {
    switch (operator) {
      case Operator.RemoteComputer:
        updateSetting({ ...settings, operator: Operator.RemoteComputer });
        break;
      case Operator.RemoteBrowser:
        updateSetting({ ...settings, operator: Operator.RemoteBrowser });
        break;
      case Operator.LocalComputer:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
      case Operator.LocalBrowser:
        updateSetting({ ...settings, operator: Operator.LocalBrowser });
        break;
      default:
        updateSetting({ ...settings, operator: Operator.LocalComputer });
        break;
    }
  }, [operator]);

  const getInstantInstructions = () => {
    if (localInstructions?.trim()) {
      return localInstructions;
    }
    if (isCallUser && savedInstructions?.trim()) {
      return savedInstructions;
    }
    return '';
  };

  // console.log('running', 'status', status, running);

  const startRun = async () => {
    const rawInstructions = getInstantInstructions();

    if (!rawInstructions.trim()) {
      return;
    }

    const intent = classifyCuaIntent(rawInstructions);
    const history = chatMessages || [];
    const session = await getSession(sessionId);

    if (!intent.requiresCua) {
      await updateSession(sessionId, {
        name: rawInstructions,
        meta: {
          ...session!.meta,
          ...(restUserData || {}),
          intent: intent.reason,
        },
      });
      run(rawInstructions, history, () => {
        setLocalInstructions('');
        setAutoSkillSummary(false);
      });
      return;
    }

    if (checkBeforeRun) {
      const checked = await checkBeforeRun();

      if (!checked) {
        return;
      }
    }

    console.log('startRun', rawInstructions, restUserData);

    await updateSession(sessionId, {
      name: rawInstructions,
      meta: {
        ...session!.meta,
        ...(restUserData || {}),
      },
    });

    run(
      rawInstructions,
      history,
      () => {
        setLocalInstructions('');
        setAutoSkillSummary(false);
      },
      { autoSkillSummaryEnabled: autoSkillSummary },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    // `enter` to submit
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      getInstantInstructions()
    ) {
      e.preventDefault();

      startRun();
    }
  };

  const isCallUser = useMemo(() => status === StatusEnum.CALL_USER, [status]);

  const lastHumanMessage =
    [...(messages || [])]
      .reverse()
      .find((m) => m?.from === 'human' && m?.value !== IMAGE_PLACEHOLDER)
      ?.value || '';

  const hasRunnableInstruction = Boolean(getInstantInstructions().trim());

  const stopRun = async () => {
    await stopAgentRuning(() => {
      setLocalInstructions('');
    });
    await api.clearHistory();
  };

  const handleUpload = (files: FileList | null) => {
    if (!files?.length) return;
    const currentImageCount = uploadedFiles.filter(
      (file) => file.kind === 'image',
    ).length;
    let availableImageSlots = Math.max(maxImageCount - currentImageCount, 0);

    const nextFiles = Array.from(files)
      .filter((file) => {
        if (file.type.startsWith('image/')) {
          if (availableImageSlots <= 0) {
            window.alert('图片最多上传 5 张');
            return false;
          }
          if (file.size > maxImageUploadSize) {
            window.alert(`${file.name} 超过 100MB，已跳过`);
            return false;
          }
          availableImageSlots -= 1;
          return true;
        }
        if (file.size > maxVideoUploadSize) {
          window.alert(`${file.name} 超过 500MB，已跳过`);
          return false;
        }
        return true;
      })
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        kind: file.type.startsWith('image/')
          ? ('image' as const)
          : file.type.startsWith('video/')
            ? ('video' as const)
            : ('document' as const),
      }));

    setUploadedFiles((current) => [...nextFiles, ...current]);
  };

  const renderButton = () => {
    if (running) {
      return (
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={stopRun}
        >
          <Square className="h-4 w-4" />
        </Button>
      );
    }

    if (isCallUser && !localInstructions) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-pink-100 hover:bg-pink-200 text-pink-500 border-pink-200"
                onClick={startRun}
                disabled={!getInstantInstructions()}
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="whitespace-pre-line">
                当 Lark-CUA 进入 &apos;CALL_USER&apos; 状态后，发送上一条指令
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={startRun}
        disabled={!getInstantInstructions() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="px-4 w-full">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={autoSkillSummary ? 'default' : 'secondary'}
            size="sm"
            disabled={!hasRunnableInstruction || running}
            onClick={() => setAutoSkillSummary((value) => !value)}
            className="rounded-full"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            自主创建技能
          </Button>
          {autoSkillSummary ? (
            <span className="text-xs text-muted-foreground">
              本轮执行中将由 AI 总结 Skill 草稿
            </span>
          ) : null}
        </div>
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            placeholder={
              isCallUser && savedInstructions
                ? `${savedInstructions}`
                : running && lastHumanMessage && messages?.length > 1
                  ? lastHumanMessage
                  : '今天我可以帮你做什么？'
            }
            className="min-h-[120px] rounded-2xl resize-none px-4 pb-16"
            value={localInstructions}
            disabled={running || disabled}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,.md,.txt,.doc,.docx,.pdf,.html,.json"
            multiple
            onChange={(event) => {
              handleUpload(event.target.files);
              event.target.value = '';
            }}
          />
          {uploadedFiles.length ? (
            <div className="absolute bottom-4 left-4 flex max-w-[60%] gap-1 overflow-hidden">
              {uploadedFiles.slice(0, 2).map((file) => (
                <span
                  key={file.id}
                  className="max-w-[120px] truncate rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {file.name}
                </span>
              ))}
            </div>
          ) : null}
          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => uploadInputRef.current?.click()}
              disabled={running || disabled}
              aria-label="上传文件"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {renderButton()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
