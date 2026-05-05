/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button } from '@renderer/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renderer/components/ui/alert-dialog';
import { useState } from 'react';
import { useSession } from '@renderer/hooks/useSession';

export const ClearHistory = () => {
  const [open, setOpen] = useState(false);
  const { currentSessionId, deleteMessages } = useSession();

  if (!currentSessionId) {
    return null;
  }

  const handleClearMessages = async () => {
    await deleteMessages(currentSessionId);
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 text-red-400 hover:bg-red-50 hover:text-red-500"
          aria-label="清空消息"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>清空聊天记录</AlertDialogTitle>
          <AlertDialogDescription>
            将清空本次会话的所有消息，此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearMessages}
            className=" bg-red-500 hover:bg-red-600"
          >
            清空
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
