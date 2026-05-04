import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Hash, Tag, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getTask, getTrace, type TaskDetail as TaskDetailType, type TraceEvent } from '@/api/client';

interface TaskDetailProps {
  taskId: string | null;
  onBack: () => void;
}

const statusConfig: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle }> = {
  queued: { label: '排队中', color: 'secondary', icon: Clock },
  running: { label: '运行中', color: 'default', icon: Loader2 },
  completed: { label: '已完成', color: 'secondary', icon: CheckCircle },
  failed: { label: '失败', color: 'destructive', icon: XCircle },
  cancelled: { label: '已取消', color: 'outline', icon: AlertCircle },
};

export function TaskDetail({ taskId, onBack }: TaskDetailProps) {
  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    
    const id = taskId;
    async function loadData() {
      setLoading(true);
      try {
        const [taskData, traceData] = await Promise.all([
          getTask(id),
          getTrace(id),
        ]);
        setTask(taskData);
        setTrace(traceData);
      } catch (error) {
        console.error('Failed to load task:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [taskId]);

  function formatTime(timestamp?: number): string {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  if (!taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">未选择任务</h3>
        <p className="text-muted-foreground mb-4">从任务列表中选择一个任务查看详情</p>
        <button onClick={onBack} className="px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
          返回任务列表
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h3 className="text-xl font-semibold mb-2">任务不存在</h3>
        <button onClick={onBack} className="px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
          返回任务列表
        </button>
      </div>
    );
  }

  const StatusIcon = statusConfig[task.status].icon;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        返回任务列表
      </button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <StatusIcon className={`w-6 h-6 ${task.status === 'completed' ? 'text-green-500' : task.status === 'failed' ? 'text-red-500' : ''}`} />
                {task.instruction}
              </CardTitle>
              <CardDescription className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1">
                  <Hash className="w-4 h-4" />
                  {task.id}
                </span>
                <Badge variant={statusConfig[task.status].color}>
                  {statusConfig[task.status].label}
                </Badge>
                {task.routedSkill && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    {task.routedSkill}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">创建时间</p>
            <p className="font-medium">{formatTime(task.enqueuedAt)}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">开始时间</p>
            <p className="font-medium">{formatTime(task.startedAt)}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">结束时间</p>
            <p className="font-medium">{formatTime(task.finishedAt)}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Token 消耗</p>
            <p className="font-medium">{task.totalTokens || 0}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="trace">
        <TabsList className="mb-4">
          <TabsTrigger value="trace">执行追踪</TabsTrigger>
          <TabsTrigger value="params">参数详情</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trace">
          <Card>
            <CardHeader>
              <CardTitle>执行日志</CardTitle>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {trace.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">暂无追踪数据</p>
                  ) : (
                    trace.map((event) => (
                      <div key={event.id} className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.started_at).toLocaleTimeString()}
                          </span>
                          <Badge variant="secondary">{event.kind}</Badge>
                          <Badge variant={event.status === 'passed' ? 'secondary' : 'destructive'}>
                            {event.status}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{event.name}</p>
                        {event.payload && (
                          <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto">
                            {typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="params">
          <Card>
            <CardHeader>
              <CardTitle>任务参数</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/50 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(task.params, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
