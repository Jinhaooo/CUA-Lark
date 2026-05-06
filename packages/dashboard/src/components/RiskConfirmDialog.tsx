import { useEffect, useMemo, useState } from 'react';
import { useSse } from '@/hooks/useSse';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  onClose?: () => void;
}

const RISK_REQUIRED_KIND = 'risk_confirmation_required';
const RISK_RESOLVED_KINDS = new Set(['risk_confirmed', 'risk_confirmation_received', 'risk_approved']);

export function RiskConfirmDialog({ taskId }: RiskConfirmDialogProps) {
  const { events } = useSse(taskId);
  const [pending, setPending] = useState<RiskConfirmationData | null>(null);

  // Pick the most recent confirmation request that hasn't been resolved by a
  // newer risk_confirmed / risk_approved / risk_confirmation_received event.
  // D33: dashboard observes only — confirm action lives in the chat window.
  const latestRequest = useMemo<RiskConfirmationData | null>(() => {
    let request: RiskConfirmationData | null = null;
    for (const evt of events) {
      const kind = (evt as { kind?: string }).kind;
      if (kind === RISK_REQUIRED_KIND) {
        const payload = (evt as unknown as { event: { payload?: Record<string, unknown> } }).event?.payload ?? {};
        request = {
          taskId: (evt as { taskId: string }).taskId,
          action: (payload.action as RiskConfirmationData['action']) ?? { name: 'unknown' },
          riskLevel: (payload.riskLevel as string) ?? 'high',
          reason: (payload.reason as string) ?? '',
          question: payload.question as string | undefined,
        };
      } else if (kind && RISK_RESOLVED_KINDS.has(kind)) {
        request = null;
      }
    }
    return request;
  }, [events]);

  useEffect(() => {
    setPending(latestRequest);
  }, [latestRequest]);

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'destructive':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-green-600 bg-green-100';
    }
  };

  if (!pending) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⚠️ Risk Confirmation Pending</span>
            <span className={`text-xs px-2 py-1 rounded ${getRiskLevelColor(pending.riskLevel)}`}>
              {pending.riskLevel.toUpperCase()}
            </span>
          </DialogTitle>
          <DialogDescription>
            Risk confirmation must be completed in the chat window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm font-medium mb-2">Action Details:</div>
            <div className="text-sm space-y-1">
              <div>
                <span className="font-mono bg-muted-foreground/10 px-1 rounded">
                  {pending.action.name}
                </span>
              </div>
              {pending.action.args !== undefined && (
                <div className="text-xs text-muted-foreground mt-1 break-words">
                  Args: {JSON.stringify(pending.action.args)}
                </div>
              )}
            </div>
          </div>

          <div className="text-sm">
            <div className="font-medium mb-1">Reason:</div>
            <div className="text-muted-foreground">{pending.reason}</div>
          </div>

          {pending.question && (
            <div className="text-sm">
              <div className="font-medium mb-1">Question:</div>
              <div className="text-muted-foreground italic">
                &ldquo;{pending.question}&rdquo;
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled
            className="cursor-not-allowed"
            title="Please use the chat window to confirm or cancel"
          >
            Cancel Operation
          </Button>
          <Button
            variant={pending.riskLevel === 'destructive' ? 'destructive' : 'default'}
            disabled
            className="cursor-not-allowed"
            title="Please use the chat window to confirm this action"
          >
            Confirm & Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useRiskConfirmation(taskId: string | null) {
  const { events } = useSse(taskId);
  const [pendingConfirmation, setPendingConfirmation] = useState<RiskConfirmationData | null>(null);

  useEffect(() => {
    let request: RiskConfirmationData | null = null;
    for (const evt of events) {
      const kind = (evt as { kind?: string }).kind;
      if (kind === RISK_REQUIRED_KIND) {
        const payload = (evt as unknown as { event: { payload?: Record<string, unknown> } }).event?.payload ?? {};
        request = {
          taskId: (evt as { taskId: string }).taskId,
          action: (payload.action as RiskConfirmationData['action']) ?? { name: 'unknown' },
          riskLevel: (payload.riskLevel as string) ?? 'high',
          reason: (payload.reason as string) ?? '',
          question: payload.question as string | undefined,
        };
      } else if (kind && RISK_RESOLVED_KINDS.has(kind)) {
        request = null;
      }
    }
    setPendingConfirmation(request);
  }, [events]);

  return { pendingConfirmation };
}
