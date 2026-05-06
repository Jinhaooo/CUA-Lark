import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Check, X, SkipForward } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Badge } from '@renderer/components/ui/badge';

interface RiskConfirmationData {
  taskId: string;
  action: {
    name: string;
    args?: unknown;
  };
  riskLevel: string;
  reason: string;
  question?: string;
}

interface RiskConfirmDialogProps {
  taskId: string | null;
}

const SERVER_URL =
  (typeof window !== 'undefined' && (window as { __CUA_SERVER_URL__?: string }).__CUA_SERVER_URL__) ||
  'http://127.0.0.1:7878';

const ipc = (typeof window !== 'undefined'
  ? (window as unknown as {
      electron?: { ipcRenderer?: { on?: (ch: string, fn: (...args: unknown[]) => void) => unknown } };
    }).electron?.ipcRenderer
  : undefined);

export function RiskConfirmDialog({ taskId }: RiskConfirmDialogProps) {
  const [pending, setPending] = useState<RiskConfirmationData | null>(null);

  // D33: chat window owns the confirm action. Subscribe to SSE-derived IPC events
  // forwarded by the main process via SseDispatcher.
  useEffect(() => {
    if (!ipc?.on) return;
    const offRequired = ipc.on('sse:risk_confirmation_required', (...args: unknown[]) => {
      const evt = args[0] as { taskId?: string; action?: RiskConfirmationData['action']; riskLevel?: string; reason?: string; question?: string } | undefined;
      if (!evt || (taskId && evt.taskId && evt.taskId !== taskId)) return;
      setPending({
        taskId: evt.taskId ?? '',
        action: evt.action ?? { name: 'unknown' },
        riskLevel: evt.riskLevel ?? 'high',
        reason: evt.reason ?? '',
        question: evt.question,
      });
    });
    const offConfirmed = ipc.on('sse:risk_confirmed', (...args: unknown[]) => {
      const evt = args[0] as { taskId?: string } | undefined;
      if (!evt || (taskId && evt.taskId && evt.taskId !== taskId)) return;
      setPending(null);
    });
    return () => {
      if (typeof offRequired === 'function') (offRequired as () => void)();
      if (typeof offConfirmed === 'function') (offConfirmed as () => void)();
    };
  }, [taskId]);

  const sendConfirm = useCallback(
    async (confirmed: boolean, reason: string) => {
      if (!pending || !taskId) return;
      try {
        await fetch(`${SERVER_URL}/tasks/${taskId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed, reason }),
        });
        setPending(null);
      } catch (error) {
        console.error('Failed to send risk confirmation:', error);
      }
    },
    [pending, taskId],
  );

  const handleConfirm = () => sendConfirm(true, 'User confirmed risk operation from chat');
  const handleDeny = () => sendConfirm(false, 'User denied risk operation from chat');

  const handleSkip = useCallback(async () => {
    if (!taskId) return;
    try {
      await fetch(`${SERVER_URL}/tasks/${taskId}/skip-step`, { method: 'POST' });
      setPending(null);
    } catch (error) {
      console.error('Failed to skip step:', error);
    }
  }, [taskId]);

  const getRiskLevelConfig = (level: string) => {
    switch (level) {
      case 'destructive':
        return { bg: 'bg-red-500', text: 'text-white', label: '毁灭性' };
      case 'high':
        return { bg: 'bg-orange-500', text: 'text-white', label: '高风险' };
      case 'medium':
        return { bg: 'bg-yellow-500', text: 'text-white', label: '中风险' };
      default:
        return { bg: 'bg-green-500', text: 'text-white', label: '低风险' };
    }
  };

  if (!pending) return null;

  const riskConfig = getRiskLevelConfig(pending.riskLevel);

  return (
    <div className="mb-4 rounded-xl border-2 border-orange-400 p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${riskConfig.bg}`}>
          <AlertTriangle className={`h-5 w-5 ${riskConfig.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold">风险确认</h4>
            <Badge className={`${riskConfig.bg} ${riskConfig.text}`}>{riskConfig.label}</Badge>
          </div>

          <p className="mb-3 text-sm text-muted-foreground">{pending.reason}</p>

          {pending.question && (
            <p className="mb-3 text-sm italic text-muted-foreground">"{pending.question}"</p>
          )}

          <div className="mb-3 rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">即将执行:</div>
            <div className="font-mono text-sm">{pending.action.name}</div>
            {pending.action.args !== undefined && (
              <div className="mt-1 text-xs text-muted-foreground break-words">
                参数: {JSON.stringify(pending.action.args)}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDeny} className="flex items-center gap-1">
              <X className="h-4 w-4" />
              取消操作
            </Button>
            <Button variant="outline" size="sm" onClick={handleSkip} className="flex items-center gap-1">
              <SkipForward className="h-4 w-4" />
              跳过步骤
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className={`flex items-center gap-1 ${pending.riskLevel === 'destructive' ? 'bg-red-500 hover:bg-red-600' : ''}`}
            >
              <Check className="h-4 w-4" />
              确认执行
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
