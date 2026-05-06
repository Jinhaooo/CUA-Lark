import { useState, useEffect } from 'react';
import { Clock, Play, Pause, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { StatusEnum } from '@ui-tars/shared/types';

const SERVER_URL =
  (typeof window !== 'undefined' && (window as { __CUA_SERVER_URL__?: string }).__CUA_SERVER_URL__) ||
  'http://127.0.0.1:7878';

interface TaskItem {
  id: string;
  name: string;
  status: StatusEnum;
  createdAt: number;
  durationMs?: number;
}

const statusConfig: Partial<Record<StatusEnum, { icon: typeof Play; color: string; bg: string; label: string }>> = {
  [StatusEnum.RUNNING]: { icon: Play, color: 'text-green-500', bg: 'bg-green-50', label: '运行中' },
  [StatusEnum.PAUSE]: { icon: Pause, color: 'text-yellow-500', bg: 'bg-yellow-50', label: '已暂停' },
  [StatusEnum.END]: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50', label: '已完成' },
  [StatusEnum.ERROR]: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: '失败' },
  [StatusEnum.USER_STOPPED]: { icon: XCircle, color: 'text-orange-500', bg: 'bg-orange-50', label: '已停止' },
};

export function RecentTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentTasks();

    const interval = setInterval(fetchRecentTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecentTasks = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/tasks?limit=5`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to fetch recent tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    } else {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">暂无任务记录</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-2">
        {tasks.map((task) => {
          const config = statusConfig[task.status] || statusConfig[StatusEnum.END]!;
          const Icon = config.icon;

          return (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50 transition-colors"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${config.bg}`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{config.label}</span>
                  <span>·</span>
                  <span>{formatTime(task.createdAt)}</span>
                  {task.durationMs && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(task.durationMs)}</span>
                    </>
                  )}
                </div>
              </div>
              {task.status === StatusEnum.PAUSE && (
                <Button variant="secondary" size="sm" className="h-7">
                  继续
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}