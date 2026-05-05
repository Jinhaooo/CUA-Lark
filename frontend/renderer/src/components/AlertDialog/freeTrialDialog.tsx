/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { memo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Label } from '@renderer/components/ui/label';

interface FreeTrialDialog {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const FreeTrialDialog = memo(
  ({ open, onOpenChange, onConfirm }: FreeTrialDialog) => {
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const onCheck = (status: boolean) => {
      setDontShowAgain(status);
    };

    const onClick = () => {
      if (dontShowAgain) {
        localStorage.setItem('isAgreeFreeTrialAgreement', 'true');
      }
      onConfirm();
    };

    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>免费试用服务协议</AlertDialogTitle>
            <AlertDialogDescription className="hidden" />
            <div className="text-muted-foreground text-sm">
              <p>
                作为研究项目的一部分，我们提供由火山引擎提供的云服务 30 分钟免费试用。
                你可以体验 Lark-CUA 的远程电脑与远程浏览器操作，无需购买模型服务与算力资源。
              </p>
              <p className="my-4">
                <b>
                  同意使用本服务即表示你的数据将会传输到服务器，请注意。
                </b>{' '}
                为遵守相关法规，请避免输入任何敏感个人信息。服务器上的所有记录仅用于学术研究，
                不会用于其他用途。
              </p>
              <p className="my-4">
                感谢你对 Lark-CUA 研究项目的支持！
              </p>
              <div className="flex items-center gap-2 mb-4 text-foreground">
                <Checkbox
                  id="free"
                  checked={dontShowAgain}
                  onCheckedChange={onCheck}
                />
                <Label htmlFor="free">我已阅读并同意，不再提示</Label>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onClick}>同意</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);
