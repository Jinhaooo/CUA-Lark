/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Maximize2,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Video,
  X,
} from 'lucide-react';

import { Button } from '@renderer/components/ui/button';
import { SidebarTrigger } from '@renderer/components/ui/sidebar';
import { Textarea } from '@renderer/components/ui/textarea';

import { Operator } from '@main/store/types';
import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useSession } from '../../hooks/useSession';
import { useSetting } from '../../hooks/useSetting';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';
import { sleep } from '@ui-tars/shared/utils';

import { DragArea } from '../../components/Common/drag';
import { api } from '@renderer/api';
import { useStore } from '@renderer/hooks/useStore';
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import {
  StatusEnum,
  type PredictionParsed,
} from '@ui-tars/shared/types';
import feishuLogo from '@resources/feishu-logo.png?url';
import {
  CUA_ENTRY_MODE_EVENT,
  getCuaEntryMode,
  setCuaEntryMode,
  type CuaEntryMode,
} from '@renderer/utils/cuaEntry';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import ImageGallery from '../../components/ImageGallery';
import ThoughtChain from '../../components/ThoughtChain';
import {
  AssistantTextMessage,
  ErrorMessage,
  HumanTextMessage,
  LoadingText,
  ScreenshotMessage,
} from '../../components/RunMessages/Messages';
import { classifyCuaIntent } from '@renderer/utils/intent';

const feishuNavItems = [
  { label: '消息', icon: MessageCircle, active: true, badge: 1 },
  { label: '知识问答', icon: Sparkles, tag: 'New' },
  { label: '云文档', icon: FileText },
  { label: '日历', icon: CalendarDays },
  { label: '视频会议', icon: Video },
  { label: '工作台', icon: Settings },
  { label: '更多', icon: MoreHorizontal },
];

const mockChats = [
  {
    name: '飞书 AI 校园挑战赛（初赛）- 官方沟通群',
    desc: '曹龙轩：提交参赛题了...',
    time: '22:40',
    avatar: '飞',
  },
  {
    name: '飞书 AI 产品创新赛道 - CUA-Lark 课题',
    desc: '鼠标偏移、重要交互与项目进展',
    time: '4月30日',
    avatar: 'AI',
  },
  {
    name: 'CUA-Lark',
    desc: '自动化：根据产品需求文档 PRD 绘制流程图',
    time: '4月30日',
    avatar: 'CUA',
  },
  { name: '测试群', desc: '刘佳：嗯好', time: '4月29日', avatar: '测' },
  { name: '智能纪要助手', desc: '飞书智能纪要：会议摘要已生成', time: '4月27日', avatar: '纪' },
  { name: '飞书 CLI', desc: '机器人：任务看一下', time: '4月25日', avatar: 'CLI' },
];

const MAX_CHAT_IMAGE_SIZE = 100 * 1024 * 1024;
const MAX_CHAT_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_CHAT_IMAGE_COUNT = 5;

type ChatUploadFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: 'image' | 'video' | 'document';
};

const getFinishedContent = (predictionParsed?: PredictionParsed[]) =>
  predictionParsed?.find(
    (step) =>
      step.action_type === 'finished' &&
      typeof step.action_inputs?.content === 'string' &&
      step.action_inputs.content.trim() !== '',
  )?.action_inputs?.content as string | undefined;

const Home = () => {
  const navigate = useNavigate();
  const {
    chatMessages,
    createSession,
    currentSessionId,
    refreshSessions,
    setActiveSession,
    updateMessages,
    updateSession,
  } = useSession();
  const { errorMsg, messages = [], status, thinking } = useStore();
  const { run } = useRunAgent();
  const { settings: localSettings, updateSetting } = useSetting();
  const [cuaMode, setCuaModeState] = useState<CuaEntryMode>(getCuaEntryMode);
  const [instruction, setInstruction] = useState('');
  const [autoSkillSummary, setAutoSkillSummary] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);
  const [uploadedFiles, setUploadedFiles] = useState<ChatUploadFile[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [iconPosition, setIconPosition] = useState(() => ({
    x: Math.max(window.innerWidth - 104, 24),
    y: Math.max(window.innerHeight / 2 - 28, 96),
  }));
  const [panelPosition, setPanelPosition] = useState(() => ({
    x: Math.max(window.innerWidth - 420, 24),
    y: Math.max(window.innerHeight / 2 - 240, 96),
  }));
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    pointerId: number;
    target: 'icon' | 'panel';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [localConfig, setLocalConfig] = useState({
    open: false,
    operator: Operator.LocalComputer,
  });
  const running = status === StatusEnum.RUNNING;

  const setMode = (mode: CuaEntryMode) => {
    setCuaModeState(mode);
    setCuaEntryMode(mode);
  };

  useEffect(() => {
    const handleModeChange = (event: Event) => {
      setCuaModeState((event as CustomEvent<CuaEntryMode>).detail);
    };

    window.addEventListener(CUA_ENTRY_MODE_EVENT, handleModeChange);
    return () =>
      window.removeEventListener(CUA_ENTRY_MODE_EVENT, handleModeChange);
  }, []);

  useEffect(() => {
    if (!currentSessionId || !messages.length) {
      return;
    }

    updateMessages(currentSessionId, messages);
    refreshSessions();
  }, [currentSessionId, messages, refreshSessions, updateMessages]);

  const handleLocalSettingsSubmit = async () => {
    setLocalConfig({ open: false, operator: localConfig.operator });

    await sleep(200);

    if (instruction.trim()) {
      await startHomeRun();
    }
  };

  const handleLocalSettingsClose = () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
  };
  const ensureLocalReady = async () => {
    const hasVLM = await checkVLMSettings();
    if (!hasVLM) {
      setLocalConfig({ open: true, operator: Operator.LocalComputer });
      return false;
    }
    return true;
  };

  const createLocalSession = async (name: string) => {
    const session = await createSession(name || '新会话', {
      operator: Operator.LocalComputer,
    });
    if (session?.id) {
      await setActiveSession(session.id);
      await updateSession(session.id, {
        name: name || '新会话',
        meta: {
          operator: Operator.LocalComputer,
        },
      });
    }
    return session;
  };

  const createFloatingConversation = async () => {
    await createLocalSession('新会话');
    await api.setMessages({ messages: [] });
    await api.setSessionHistoryMessages({ messages: [] });
    setInstruction('');
    setAutoSkillSummary(false);
    setUploadedFiles([]);
    setSelectImg(undefined);
    setShowImagePanel(false);
  };

  const handleChatUpload = (files: FileList | null) => {
    if (!files?.length) return;
    const currentImageCount = uploadedFiles.filter(
      (file) => file.kind === 'image',
    ).length;
    let availableImageSlots = Math.max(
      MAX_CHAT_IMAGE_COUNT - currentImageCount,
      0,
    );
    const nextFiles = Array.from(files)
      .filter((file) => {
        if (file.type.startsWith('image/')) {
          if (availableImageSlots <= 0) {
            window.alert('图片最多上传 5 张');
            return false;
          }
          if (file.size > MAX_CHAT_IMAGE_SIZE) {
            window.alert(`${file.name} 超过 100MB，已跳过`);
            return false;
          }
          availableImageSlots -= 1;
          return true;
        }
        if (file.size > MAX_CHAT_VIDEO_SIZE) {
          window.alert(`${file.name} 超过 500MB，已跳过`);
          return false;
        }
        return true;
      })
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        kind: file.type.startsWith('image/')
          ? ('image' as const)
          : file.type.startsWith('video/')
            ? ('video' as const)
            : ('document' as const),
      }));

    setUploadedFiles((current) => [...nextFiles, ...current]);
  };

  const renderUploadedFiles = () =>
    uploadedFiles.length ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {uploadedFiles.map((file) => (
          <div
            key={file.id}
            className="flex max-w-[220px] items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
          >
            {file.kind === 'image' ? (
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            ) : file.kind === 'video' ? (
              <Video className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              className="ml-1 text-blue-400 hover:text-blue-700"
              onClick={() =>
                setUploadedFiles((current) =>
                  current.filter((item) => item.id !== file.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    ) : null;

  const expandPanelToCurrentConversation = async () => {
    let sessionId = currentSessionId;

    if (!sessionId) {
      const session = await createLocalSession('新会话');
      sessionId = session?.id || '';
      await api.setMessages({ messages: [] });
      await api.setSessionHistoryMessages({ messages: [] });
    } else {
      await setActiveSession(sessionId);
    }

    if (!sessionId) return;

    if (messages.length) {
      await updateMessages(sessionId, messages);
    }
    await refreshSessions();

    navigate('/local', {
      state: {
        operator: Operator.LocalComputer,
        sessionId,
        from: 'home',
      },
    });
    requestAnimationFrame(() => {
      setCuaEntryMode('full');
    });
  };

  const startHomeRun = async () => {
    const content = instruction.trim();
    if (!content || launching || running) return;
    const intent = classifyCuaIntent(content);
    if (intent.requiresCua) {
      const ready = await ensureLocalReady();
      if (!ready) return;
    }

    setLaunching(true);
    try {
      const session = await createLocalSession(content);
      setInstruction('');
      navigate('/local', {
        state: {
          operator: Operator.LocalComputer,
          sessionId: session?.id,
          from: 'home',
          initialInstruction: content,
          autoRun: true,
          autoSkillSummaryEnabled: autoSkillSummary,
        },
      });
    } finally {
      setLaunching(false);
    }
  };

  const runFromCuaPanel = async () => {
    const content = instruction.trim();
    if (!content || launching || running) return;
    const intent = classifyCuaIntent(content);

    setLaunching(true);
    try {
      let sessionId = currentSessionId;

      if (!sessionId) {
        const session = await createLocalSession(content);
        sessionId = session?.id || '';
      }

      if (!sessionId) return;

      await updateSession(sessionId, {
        name: content,
        meta: {
          operator: Operator.LocalComputer,
          intent: intent.reason,
        },
      });

      if (intent.requiresCua) {
        const ready = await ensureLocalReady();
        if (!ready) return;

        await updateSetting({
          ...localSettings,
          operator: Operator.LocalComputer,
        });
      }

      await run(
        content,
        chatMessages,
        () => {
          setInstruction('');
          setAutoSkillSummary(false);
          setMode('panel');
          refreshSessions();
        },
        {
          autoSkillSummaryEnabled: autoSkillSummary,
          operator: Operator.LocalComputer,
        },
      );
    } finally {
      setLaunching(false);
    }
  };

  const clampEntryPosition = (
    x: number,
    y: number,
    target: 'icon' | 'panel' = 'icon',
  ) => {
    const width = target === 'panel' ? 360 : 56;
    const height = target === 'panel' ? 292 : 56;
    return {
      x: Math.min(Math.max(x, 12), window.innerWidth - width - 12),
      y: Math.min(Math.max(y, 12), window.innerHeight - height - 12),
    };
  };

  const handleEntryPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      target: 'icon',
      startX: event.clientX,
      startY: event.clientY,
      originX: iconPosition.x,
      originY: iconPosition.y,
    };
  };

  const handleEntryPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag?.active || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      drag.moved = true;
    }
    const nextPosition = clampEntryPosition(
      drag.originX + deltaX,
      drag.originY + deltaY,
      drag.target,
    );
    if (drag.target === 'panel') {
      setPanelPosition(nextPosition);
    } else {
      setIconPosition(nextPosition);
    }
  };

  const handleEntryPointerUp = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!drag.moved) {
        setMode('panel');
      }
      dragRef.current = null;
    }
  };

  const handleEntryPointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handlePanelPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      target: 'panel',
      startX: event.clientX,
      startY: event.clientY,
      originX: Math.min(panelPosition.x, window.innerWidth - 372),
      originY: Math.min(panelPosition.y, window.innerHeight - 304),
    };
  };

  const handlePanelPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    handleEntryPointerMove(
      event as unknown as React.PointerEvent<HTMLButtonElement>,
    );
  };

  const handlePanelPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
    }
  };

  const handlePanelPointerCancel = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const renderCuaEntry = () => {
    const displayMessages = messages.length ? messages : chatMessages;
    const panelWidth = showImagePanel ? 760 : 360;
    const panelLeft = Math.min(
      panelPosition.x,
      window.innerWidth - panelWidth - 12,
    );
    const panelTop = Math.min(panelPosition.y, window.innerHeight - 520);

    const renderFloatingLog = () => {
      if (!displayMessages.length && !thinking && !errorMsg) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            输入指令后，这里会展示任务日志
          </div>
        );
      }

      return (
        <ScrollArea className="h-full pr-2">
          <div className="space-y-2">
            {displayMessages.map((message, idx) => {
              if (message?.from === 'human') {
                if (message?.value === IMAGE_PLACEHOLDER) {
                  return (
                    <ScreenshotMessage
                      key={`floating-message-${idx}`}
                      onClick={() => {
                        setSelectImg(idx);
                        setShowImagePanel(true);
                      }}
                    />
                  );
                }

                return (
                  <HumanTextMessage
                    key={`floating-message-${idx}`}
                    text={message?.value}
                  />
                );
              }

              const { predictionParsed, screenshotBase64WithElementMarker } =
                message;
              const finishedStep = getFinishedContent(predictionParsed);

              return (
                <div key={`floating-message-${idx}`}>
                  {predictionParsed?.length ? (
                    <ThoughtChain
                      steps={predictionParsed}
                      hasSomImage={!!screenshotBase64WithElementMarker}
                      onClick={() => {
                        setSelectImg(idx);
                        setShowImagePanel(true);
                      }}
                    />
                  ) : null}
                  {!!finishedStep && <AssistantTextMessage text={finishedStep} />}
                </div>
              );
            })}
            {thinking && <LoadingText text="Thinking..." />}
            {errorMsg && <ErrorMessage text={errorMsg} />}
          </div>
        </ScrollArea>
      );
    };

    if (cuaMode === 'icon') {
      return (
        <button
          type="button"
          onPointerDown={handleEntryPointerDown}
          onPointerMove={handleEntryPointerMove}
          onPointerUp={handleEntryPointerUp}
          onPointerCancel={handleEntryPointerCancel}
          onDragStart={(event) => event.preventDefault()}
          style={{ left: iconPosition.x, top: iconPosition.y }}
          draggable={false}
          className="fixed z-50 flex h-14 w-14 cursor-grab touch-none select-none items-center justify-center rounded-2xl border border-blue-200 bg-white/95 shadow-[0_18px_50px_rgba(30,85,220,0.22)] hover:shadow-[0_22px_58px_rgba(30,85,220,0.28)] active:cursor-grabbing"
          aria-label="打开 CUA-Agent"
        >
          <img
            src={feishuLogo}
            alt=""
            draggable={false}
            className="pointer-events-none h-9 w-9 rounded-xl"
          />
        </button>
      );
    }

    return (
      <div
        style={{ left: panelLeft, top: panelTop }}
        className="future-floating-panel fixed z-50 flex max-h-[calc(100vh-24px)] flex-col rounded-3xl border p-4 backdrop-blur-xl"
      >
        <div
          className="mb-4 flex cursor-grab touch-none select-none items-center justify-between active:cursor-grabbing"
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          onPointerCancel={handlePanelPointerCancel}
          onDragStart={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-3">
            <img src={feishuLogo} alt="" className="h-10 w-10 rounded-xl" />
            <div className="text-sm font-semibold">CUA-Agent</div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={createFloatingConversation}
            >
              <MessageCirclePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                void expandPanelToCurrentConversation();
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setMode('icon')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className="grid min-h-0 gap-3"
          style={{
            gridTemplateColumns: showImagePanel ? '360px 360px' : '360px',
            width: panelWidth,
          }}
        >
          <div className="flex min-h-0 flex-col gap-3">
            <div className="h-[240px] rounded-2xl border border-blue-100 bg-white/70 p-3">
              {renderFloatingLog()}
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant={autoSkillSummary ? 'default' : 'secondary'}
                  size="sm"
                  disabled={running || launching}
                  onClick={() => setAutoSkillSummary((value) => !value)}
                  className="rounded-full"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  自主创建技能
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="今天我可以帮你做什么？"
                  className="min-h-[110px] resize-none rounded-2xl border-blue-100 bg-white/90 px-4 pb-14 pt-4 text-sm"
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void runFromCuaPanel();
                    }
                  }}
                />
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,.md,.txt,.doc,.docx,.pdf,.html,.json"
                  multiple
                  onChange={(event) => {
                    handleChatUpload(event.target.files);
                    event.target.value = '';
                  }}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={launching || running}
                    className="h-8 w-8 rounded-full"
                    aria-label="上传文件"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    onClick={runFromCuaPanel}
                    disabled={!instruction.trim() || launching || running}
                    className="h-8 w-8 rounded-full"
                    aria-label="发送指令"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {renderUploadedFiles()}
            </div>
          </div>
          {showImagePanel ? (
            <div className="flex h-[398px] min-w-0 flex-col rounded-2xl border border-blue-100 bg-white/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">截图</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowImagePanel(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <ImageGallery
                  messages={displayMessages}
                  selectImgIndex={selectImg}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  if (cuaMode !== 'full') {
    return (
      <div className="fixed inset-0 z-40 overflow-hidden bg-[#edf2fb]">
        <DragArea></DragArea>
        <div className="flex h-full w-full">
          <aside className="flex w-[128px] flex-col bg-[#dce5f3] px-3 py-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-xs font-semibold text-white">
                刘佳
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-slate-500">
                +
              </div>
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/70 px-2 py-2 text-xs text-slate-500">
              <Search className="h-3.5 w-3.5" />
              搜索
            </div>
            <div className="space-y-1">
              {feishuNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between rounded-lg px-2 py-2 text-xs ${
                      item.active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                    {item.badge ? (
                      <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                        {item.badge}
                      </span>
                    ) : item.tag ? (
                      <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-500">
                        {item.tag}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 gap-1 p-1">
            <section className="w-[320px] rounded-l-xl bg-white/95">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
                <span className="font-medium">消息</span>
              </div>
              <div className="p-3">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-orange-300 text-white">
                    知
                  </div>
                  <div>
                    <div className="text-sm font-medium">知识问答</div>
                    <div className="text-xs text-slate-400">智能助手</div>
                  </div>
                </div>
                <div className="space-y-1">
                  {mockChats.map((chat) => (
                    <div
                      key={chat.name}
                      className="flex gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef5ff] text-[11px] font-semibold text-blue-600">
                        {chat.avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">
                            {chat.name}
                          </div>
                          <div className="shrink-0 text-[11px] text-slate-400">
                            {chat.time}
                          </div>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {chat.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-1 items-center justify-center rounded-r-xl bg-white/95">
              <div className="text-center text-slate-500">
                <div className="mb-5 text-5xl">🥹</div>
                <div className="text-sm">今天也辛苦啦，飞书陪你一起努力</div>
              </div>
            </section>
          </main>
        </div>
        {renderCuaEntry()}
        <LocalSettingsDialog
          isOpen={localConfig.open}
          onSubmit={handleLocalSettingsSubmit}
          onClose={handleLocalSettingsClose}
        />
      </div>
    );
  }

  return (
    <div className="future-shell w-full h-full flex flex-col">
      <DragArea></DragArea>
      <div className="w-full px-6 pt-4 flex items-center justify-between">
        <SidebarTrigger variant="secondary" className="size-8" />
        <div className="pr-12" />
      </div>
      <div className="w-full h-full flex flex-col items-center justify-center px-8">
        <h1 className="mb-8 text-center text-2xl font-semibold">
          欢迎使用 Lark-CUA
        </h1>
        <div className="w-full max-w-3xl rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-[0_24px_80px_rgba(35,86,180,0.18)] backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <Button
              type="button"
              variant={autoSkillSummary ? 'default' : 'secondary'}
              size="sm"
              disabled={running || launching}
              onClick={() => setAutoSkillSummary((value) => !value)}
              className="rounded-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              自主创建技能
            </Button>
          </div>
          <div className="relative">
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="例如：帮我打开 CUA-Lark 群，整理最新需求并回复进度"
              className="min-h-[180px] resize-none rounded-2xl border-blue-100 bg-white/90 px-4 pb-16 pt-4 text-sm"
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void startHomeRun();
                }
              }}
            />
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.md,.txt,.doc,.docx,.pdf,.html,.json"
              multiple
              onChange={(event) => {
                handleChatUpload(event.target.files);
                event.target.value = '';
              }}
            />
            <div className="absolute bottom-4 left-4">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => uploadInputRef.current?.click()}
                disabled={launching || running}
                className="h-9 w-9 rounded-full"
                aria-label="上传文件"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="absolute bottom-4 right-4">
              <Button
                type="button"
                size="icon"
                onClick={startHomeRun}
                disabled={!instruction.trim() || launching || running}
                className="h-10 w-10 rounded-full"
                aria-label="发送指令"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {renderUploadedFiles()}
        </div>
      </div>
      <LocalSettingsDialog
        isOpen={localConfig.open}
        onSubmit={handleLocalSettingsSubmit}
        onClose={handleLocalSettingsClose}
      />
      <DragArea></DragArea>
    </div>
  );
};

export default Home;
