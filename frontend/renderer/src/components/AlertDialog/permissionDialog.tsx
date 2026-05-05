/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

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
import { api } from '@renderer/api';

type EnsurePermissions = {
  screenCapture?: boolean;
  accessibility?: boolean;
};

interface PermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions?: EnsurePermissions;
  onPermissionsUpdated?: (permissions: EnsurePermissions) => void;
}

export const PermissionDialog = memo(function PermissionDialog({
  open,
  onOpenChange,
  permissions,
  onPermissionsUpdated,
}: PermissionDialogProps) {
  const [loading, setLoading] = useState(false);

  const items = useMemo(
    () => [
      {
        key: 'screenCapture',
        title: '屏幕录制权限',
        ok: !!permissions?.screenCapture,
        desc: '用于识别当前界面并生成可回溯的截图日志。',
      },
      {
        key: 'accessibility',
        title: '辅助功能权限',
        ok: !!permissions?.accessibility,
        desc: '用于在飞书客户端内执行点击、输入等操作。',
      },
    ],
    [permissions?.accessibility, permissions?.screenCapture],
  );

  const allOk = items.every((i) => i.ok);

  const request = useCallback(async () => {
    try {
      setLoading(true);
      const next = await api.getEnsurePermissions();
      onPermissionsUpdated?.(next || {});

      if (next?.screenCapture && next?.accessibility) {
        toast.success('权限已就绪，可以开始使用');
        onOpenChange(false);
      } else {
        toast.warning('请在系统设置中完成授权后再试一次');
      }
    } catch (e) {
      console.error(e);
      toast.error('获取权限状态失败');
    } finally {
      setLoading(false);
    }
  }, [onOpenChange, onPermissionsUpdated]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            首次启用需要系统权限
          </AlertDialogTitle>
          <AlertDialogDescription>
            为了让 CUA Agent 控制飞书客户端，需要授予以下权限（可随时在系统设置撤销）。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-2 space-y-3">
          {items.map((i) => (
            <div
              key={i.key}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="font-medium">{i.title}</div>
                <div className="text-sm text-muted-foreground">{i.desc}</div>
              </div>
              <div className="shrink-0">
                {i.ok ? (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    已授予
                  </span>
                ) : (
                  <span className="text-sm text-amber-600">未授予</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={loading}>稍后</AlertDialogCancel>
          {allOk ? (
            <AlertDialogAction onClick={() => onOpenChange(false)}>
              完成
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={request} disabled={loading}>
              {loading ? '检查中…' : '去授权 / 刷新状态'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

