import { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { listTasks, type TaskSummary } from '@/api/client';

interface TaskListProps {
  onSelectTask: (task: TaskSummary) => void;
}

const statusConfig: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: '排队中', color: 'secondary' },
  running: { label: '运行中', color: 'default' },
  completed: { label: '已完成', color: 'secondary' },
  failed: { label: '失败', color: 'destructive' },
  cancelled: { label: '已取消', color: 'outline' },
};

export function TaskList({ onSelectTask }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [statusFilter]);

  async function loadTasks() {
    setLoading(true);
    try {
      const result = await listTasks({ status: statusFilter, limit: 20, offset: 0 });
      setTasks(result.tasks);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDuration(startedAt?: number, finishedAt?: number): string {
    if (!startedAt) return '-';
    const end = finishedAt || Date.now();
    const ms = end - startedAt;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    }
    return `${seconds}秒`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索任务..."
              className="pl-10 w-64"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                {statusFilter ? statusConfig[statusFilter].label : '全部状态'}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter(undefined)}>
                全部状态
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {Object.entries(statusConfig).map(([key, { label }]) => (
                <DropdownMenuItem key={key} onClick={() => setStatusFilter(key)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="text-sm text-muted-foreground">
          共 {total} 个任务
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-muted-foreground">
              <div className="col-span-5">指令</div>
              <div className="col-span-2">状态</div>
              <div className="col-span-2">技能</div>
              <div className="col-span-2">耗时</div>
              <div className="col-span-1">结果</div>
            </div>
          </div>
          
          <div className="divide-y">
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                暂无任务
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="w-full grid grid-cols-12 gap-4 px-6 py-4 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="col-span-5 truncate" title={task.instruction}>
                    {task.instruction}
                  </div>
                  <div className="col-span-2">
                    <Badge variant={statusConfig[task.status].color}>
                      {statusConfig[task.status].label}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {task.routedSkill || '-'}
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="text-sm">{formatDuration(task.startedAt, task.finishedAt)}</span>
                  </div>
                  <div className="col-span-1">
                    {task.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {task.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
