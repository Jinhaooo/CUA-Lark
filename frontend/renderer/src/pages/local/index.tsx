import { MessageCirclePlus, LayoutDashboard } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Card } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { NavHeader } from '@renderer/components/Detail/NavHeader';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

import { useStore } from '@renderer/hooks/useStore';
import { useSession } from '@renderer/hooks/useSession';
import { api } from '../../api';
import Prompts from '../../components/Prompts';
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import {
  AssistantTextMessage,
  ErrorMessage,
  HumanTextMessage,
  RunningIndicator,
  ScreenshotMessage,
} from '../../components/RunMessages/Messages';
import ThoughtChain from '../../components/ThoughtChain';
import { PredictionParsed, StatusEnum } from '@ui-tars/shared/types';
import { RouterState } from '../../typings';
import ChatInput from '../../components/ChatInput';
import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { NavDialog } from '../../components/AlertDialog/navDialog';
import { RiskConfirmDialog } from '../../components/RiskConfirmDialog';

const getFinishedContent = (predictionParsed?: PredictionParsed[]) =>
  predictionParsed?.find(
    (step) =>
      step.action_type === 'finished' &&
      typeof step.action_inputs?.content === 'string' &&
      step.action_inputs.content.trim() !== '',
  )?.action_inputs?.content as string | undefined;

const LocalOperator = () => {
  // useLocation().state is null when this page is mounted via direct nav
  // (e.g. history back from /dashboard). Default to an empty RouterState so
  // downstream `state.sessionId` access doesn't crash the renderer.
  const state = (useLocation().state as RouterState | null) ?? ({} as RouterState);
  const navigate = useNavigate();

  const { status, messages = [], thinking, errorMsg } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions: string[] = [];
  const [, setSelectImg] = useState<number | undefined>(undefined);
  const [initId, setInitId] = useState('');
  const {
    currentSessionId,
    setActiveSession,
    updateMessages,
    createSession,
    chatMessages,
  } = useSession();
  const [pendingAction, setPendingAction] = useState<'newChat' | 'back' | null>(
    null,
  );
  const [isNavDialogOpen, setNavDialogOpen] = useState(false);
  const { run } = useRunAgent();
  const autoRunStartedRef = useRef(false);

  useEffect(() => {
    const update = async () => {
      if (state.sessionId) {
        await setActiveSession(state.sessionId);
        setInitId(state.sessionId);
      }
    };
    update();
  }, [state.sessionId]);

  useEffect(() => {
    const initialInstruction = state.initialInstruction?.trim();
    if (
      !state.autoRun ||
      !initialInstruction ||
      autoRunStartedRef.current ||
      !state.sessionId ||
      !currentSessionId ||
      state.sessionId !== currentSessionId
    ) {
      return;
    }

    autoRunStartedRef.current = true;
    run(initialInstruction, chatMessages, undefined, {
      autoSkillSummaryEnabled: Boolean(state.autoSkillSummaryEnabled),
    });
  }, [
    state.autoRun,
    state.autoSkillSummaryEnabled,
    state.initialInstruction,
    state.sessionId,
    currentSessionId,
    chatMessages.length,
    run,
  ]);

  useEffect(() => {
    if (initId !== state.sessionId) {
      return;
    }

    if (
      state.sessionId &&
      currentSessionId &&
      state.sessionId !== currentSessionId
    ) {
      return;
    }

    if (messages.length) {
      const existingMessagesSet = new Set(
        chatMessages.map(
          (msg) => `${msg.value}-${msg.from}-${msg.timing?.start}`,
        ),
      );
      const newMessages = messages.filter(
        (msg) =>
          !existingMessagesSet.has(
            `${msg.value}-${msg.from}-${msg.timing?.start}`,
          ),
      );
      const allMessages = [...chatMessages, ...newMessages];

      updateMessages(state.sessionId, allMessages);
    }
  }, [
    initId,
    state.sessionId,
    currentSessionId,
    chatMessages.length,
    messages.length,
  ]);

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  const handleImageSelect = async (index: number) => {
    setSelectImg(index);
  };

  // check status before nav
  const needsConfirm =
    status === StatusEnum.RUNNING ||
    status === StatusEnum.CALL_USER ||
    status === StatusEnum.PAUSE;

  const onNewChat = useCallback(async () => {
    const session = await createSession('新会话', {
      operator: state.operator,
    });

    navigate('/local', {
      state: {
        operator: state.operator,
        sessionId: session?.id,
        from: 'new',
      },
    });
  }, []);

  const onBack = useCallback(async () => {
    navigate('/');
  }, []);

  const handleNewChat = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('newChat');
      setNavDialogOpen(true);
    } else {
      onNewChat();
    }
  }, [needsConfirm, onNewChat]);

  const handleBack = useCallback(() => {
    if (needsConfirm) {
      setPendingAction('back');
      setNavDialogOpen(true);
    } else {
      onBack();
    }
  }, [needsConfirm, onBack]);

  const onConfirm = useCallback(async () => {
    if (pendingAction === 'newChat') {
      await onNewChat();
    } else if (pendingAction === 'back') {
      await onBack();
    }
    setPendingAction(null);
    setNavDialogOpen(false);
  }, [pendingAction]);

  const onCancel = useCallback(() => {
    setPendingAction(null);
    setNavDialogOpen(false);
  }, []);

  const checkVLM = async () => {
    return true;
  };

  const handleOpenDashboard = useCallback(() => {
    // Embedded view at /dashboard route — iframes the dashboard SPA so
    // execution info syncs in-place without leaving the app.
    navigate('/dashboard');
  }, [navigate]);

  const renderChatList = () => {
    return (
      <ScrollArea className="h-full px-4">
        <div ref={containerRef}>
          {!chatMessages?.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {chatMessages?.map((message, idx) => {
            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                // screen shot
                return (
                  <ScreenshotMessage
                    key={`message-${idx}`}
                    onClick={() => handleImageSelect(idx)}
                  />
                );
              }

              return (
                <HumanTextMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            const { predictionParsed, screenshotBase64WithElementMarker } =
              message;

            // Find the finished step (VL 1.5 Model)
            const finishedStep = getFinishedContent(predictionParsed);

            return (
              <div key={idx}>
                {predictionParsed?.length ? (
                  <ThoughtChain
                    steps={predictionParsed}
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => handleImageSelect(idx)}
                  />
                ) : null}

                {!!finishedStep && <AssistantTextMessage text={finishedStep} />}
              </div>
            );
          })}

          {(status === StatusEnum.RUNNING ||
            status === StatusEnum.CALL_USER ||
            status === StatusEnum.PAUSE) && (
            <RunningIndicator messages={messages} />
          )}
          {errorMsg && <ErrorMessage text={errorMsg} />}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="flex flex-col w-full h-full">
      <NavHeader onBack={handleBack}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenDashboard}
          title="在浏览器打开 Dashboard（trace / failure cluster / few-shot 视图）"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Button>
      </NavHeader>
      <div className="px-4 pb-4 flex flex-1">
        <Card className="flex-1 px-0 py-3 gap-3 h-[calc(100vh-76px)]">
          <div className="flex items-center justify-end w-full px-4">
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <MessageCirclePlus />
              新对话
            </Button>
          </div>
          <RiskConfirmDialog taskId={state.sessionId} />
          {renderChatList()}
          <ChatInput
            disabled={false}
            operator={state.operator}
            sessionId={state.sessionId}
            checkBeforeRun={checkVLM}
          />
        </Card>
      </div>
      <NavDialog
        open={isNavDialogOpen}
        onOpenChange={onCancel}
        onConfirm={onConfirm}
      />
    </div>
  );
};

export default LocalOperator;
