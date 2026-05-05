import { useMemo, useState } from 'react';
import { CheckCircle2, RefreshCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@renderer/components/ui/button';
import { usePermissions } from '@renderer/hooks/usePermissions';

export const PermissionSettings = () => {
  const { ensurePermissions, getEnsurePermissions } = usePermissions();
  const [loading, setLoading] = useState(false);

  const items = useMemo(
    () => [
      {
        key: 'screenCapture',
        title: '屏幕录制权限',
        ok: !!ensurePermissions?.screenCapture,
        desc: '用于识别当前界面、生成截图日志，并让 Agent 了解飞书客户端当前状态。',
      },
      {
        key: 'accessibility',
        title: '辅助功能权限',
        ok: !!ensurePermissions?.accessibility,
        desc: '用于在飞书客户端内执行点击、输入、快捷键等电脑操作。',
      },
    ],
    [ensurePermissions?.accessibility, ensurePermissions?.screenCapture],
  );

  const allOk = items.every((item) => item.ok);

  const refreshPermissions = async () => {
    try {
      setLoading(true);
      const next = await getEnsurePermissions();
      if (next?.screenCapture && next?.accessibility) {
        toast.success('权限已就绪，可以开始使用');
      } else {
        toast.warning('请在系统设置中完成授权后再刷新状态');
      }
    } catch (error) {
      console.error('获取权限状态失败:', error);
      toast.error('获取权限状态失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="mb-1 flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4" />
          电脑操作权限
        </div>
        <p className="text-sm text-muted-foreground">
          CUA-Agent 需要以下系统权限才能在飞书桌面端内完成识别、点击和输入操作。
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-4 rounded-lg border p-4"
          >
            <div className="min-w-0">
              <div className="font-medium">{item.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {item.desc}
              </div>
            </div>
            <div className="shrink-0">
              {item.ok ? (
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

      <div className="flex items-center gap-3">
        <Button type="button" onClick={refreshPermissions} disabled={loading}>
          <RefreshCcw
            className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          {loading ? '检查中…' : allOk ? '刷新权限状态' : '去授权 / 刷新状态'}
        </Button>
        <span className="text-sm text-muted-foreground">
          {allOk ? '当前权限已全部就绪' : '授权完成后请回到这里刷新状态'}
        </span>
      </div>
    </div>
  );
};
