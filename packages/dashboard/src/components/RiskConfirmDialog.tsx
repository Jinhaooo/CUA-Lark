import { useState, useEffect } from 'react';
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
import { apiClient } from '@/api/client';

interface RiskConfirmationData {
  taskId: string;
    action: {
      name: string;
      args?: unknown;
    };
  riskLevel: string;
  reason: string;
  question: string;
}

interface RiskConfirmDialogProps {
  taskId: string | null;
  onClose: () => void;
}

export function RiskConfirmDialog({ taskId, onClose }: RiskConfirmDialogProps) {
  const [pendingConfirmation, setPendingConfirmation] = useState<RiskConfirmationData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { events } = useSse(taskId);
  const lastEvent = events.at(-1);

  useEffect(() => {
    if (lastEvent?.kind === 'risk_confirmation_required') {
      setPendingConfirmation(lastEvent as unknown as RiskConfirmationData);
      setIsOpen(true);
    }
  }, [lastEvent]);

  const handleConfirm = async () => {
    if (!taskId) return;

    try {
      await apiClient.post(`/tasks/${taskId}/confirm`, {
        confirmed: true,
        reason: 'User confirmed risk operation',
      });
      setIsOpen(false);
      setPendingConfirmation(null);
      onClose();
    } catch (error) {
      console.error('Failed to confirm:', error);
    }
  };

  const handleDeny = async () => {
    if (!taskId) return;

    try {
      await apiClient.post(`/tasks/${taskId}/confirm`, {
        confirmed: false,
        reason: 'User denied risk operation',
      });
      setIsOpen(false);
      setPendingConfirmation(null);
      onClose();
    } catch (error) {
      console.error('Failed to deny:', error);
    }
  };

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

  if (!pendingConfirmation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⚠️ Risk Confirmation Required</span>
            <span className={`text-xs px-2 py-1 rounded ${getRiskLevelColor(pendingConfirmation.riskLevel)}`}>
              {pendingConfirmation.riskLevel.toUpperCase()}
            </span>
          </DialogTitle>
          <DialogDescription>
            A potentially risky operation is requesting confirmation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm font-medium mb-2">Action Details:</div>
            <div className="text-sm space-y-1">
              <div>
                <span className="font-mono bg-muted-foreground/10 px-1 rounded">
                  {pendingConfirmation.action.name}
                </span>
              </div>
              {pendingConfirmation.action.args !== undefined && (
                <div className="text-xs text-muted-foreground mt-1">
                  Args: {JSON.stringify(pendingConfirmation.action.args, null, 2)}
                </div>
              )}
            </div>
          </div>

          <div className="text-sm">
            <div className="font-medium mb-1">Reason:</div>
            <div className="text-muted-foreground">{pendingConfirmation.reason}</div>
          </div>

          {pendingConfirmation.question && (
            <div className="text-sm">
              <div className="font-medium mb-1">Question:</div>
              <div className="text-muted-foreground italic">
                &ldquo;{pendingConfirmation.question}&rdquo;
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDeny}>
            Cancel Operation
          </Button>
          <Button
            variant={pendingConfirmation.riskLevel === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
          >
            Confirm & Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useRiskConfirmation(taskId: string | null) {
  const [pendingConfirmation, setPendingConfirmation] = useState<RiskConfirmationData | null>(null);
  const { events } = useSse(taskId);
  const lastEvent = events.at(-1);

  useEffect(() => {
    if (lastEvent?.kind === 'risk_confirmation_required') {
      setPendingConfirmation(lastEvent as unknown as RiskConfirmationData);
    }
  }, [lastEvent]);

  return { pendingConfirmation };
}
