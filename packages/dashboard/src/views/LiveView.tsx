import { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw, Terminal, MessageSquare, Zap, SkipForward, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useSse } from '@/hooks/useSse';
import { createTask, listTasks, type TaskSummary } from '@/api/client';

interface TaskStatus extends TaskSummary {
  isPaused?: boolean;
}

export function LiveView() {
  const [instruction, setInstruction] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskStatus | null>(null);
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const { events, isConnected } = useSse(selectedTask?.id || null);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    const pauseEvent = events.find(e => e.kind === 'task_paused');
    const resumeEvent = events.find(e => e.kind === 'task_resumed');
    
    if (selectedTask && pauseEvent && (!resumeEvent || pauseEvent.event.started_at > (resumeEvent?.event.started_at || 0))) {
      setSelectedTask(prev => prev ? { ...prev, isPaused: true } : null);
    } else if (selectedTask) {
      setSelectedTask(prev => prev ? { ...prev, isPaused: false } : null);
    }
  }, [events, selectedTask]);

  async function loadTasks() {
    try {
      const result = await listTasks({ status: 'running', limit: 10 });
      setTasks(result.tasks.map(t => ({ ...t, isPaused: false })));
      if (result.tasks.length > 0 && !selectedTask) {
        setSelectedTask({ ...result.tasks[0], isPaused: false });
      }
    } catch {
    }
  }

  async function handleSubmit() {
    if (!instruction.trim()) return;
    
    try {
      await createTask({ instruction });
      await loadTasks();
      setInstruction('');
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }

  async function handleResume() {
    if (!selectedTask?.id) return;
    
    try {
      await fetch(`/api/tasks/${selectedTask.id}/resume`, { method: 'POST' });
      setSelectedTask(prev => prev ? { ...prev, isPaused: false } : null);
    } catch (error) {
      console.error('Failed to resume task:', error);
    }
  }

  async function handlePause() {
    if (!selectedTask?.id) return;
    
    try {
      await fetch(`/api/tasks/${selectedTask.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user_dashboard' })
      });
      setSelectedTask(prev => prev ? { ...prev, isPaused: true } : null);
    } catch (error) {
      console.error('Failed to pause task:', error);
    }
  }

  async function handleSkipStep() {
    if (!selectedTask?.id) return;

    try {
      await fetch(`/api/tasks/${selectedTask.id}/skip-step`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to skip step:', error);
    }
  }

  async function handleCancel() {
    if (!selectedTask?.id) return;
    if (!window.confirm('确定取消该任务吗？取消后无法恢复。')) return;

    try {
      await fetch(`/api/tasks/${selectedTask.id}`, { method: 'DELETE' });
      setSelectedTask(null);
      void loadTasks();
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }

  const recentTasks = tasks.slice(0, 5);
  const isPaused = selectedTask?.isPaused;

  return (
    <div className="h-full flex gap-6">
      <div className="flex-1 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              任务输入
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="输入任务指令..."
                className="h-12 text-lg"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <div className="flex gap-3">
                <Button onClick={handleSubmit} className="flex-1">
                  <Play className="w-4 h-4 mr-2" />
                  开始执行
                </Button>
                <Button variant="outline">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`flex-1 ${isPaused ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              实时日志
              <Badge variant={isConnected ? 'default' : 'destructive'}>
                {isConnected ? '已连接' : '未连接'}
              </Badge>
              {isPaused && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                  ⏸️ 已暂停
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              {selectedTask && (
                <>
                  {isPaused ? (
                    <Button variant="default" size="sm" onClick={handleResume}>
                      <Play className="w-4 h-4 mr-1" />
                      继续
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={handlePause}>
                      <Pause className="w-4 h-4 mr-1" />
                      暂停
                    </Button>
                  )}
                  {isPaused && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleSkipStep}>
                        <SkipForward className="w-4 h-4 mr-1" />
                        跳过步骤
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleCancel}>
                        <X className="w-4 h-4 mr-1" />
                        取消
                      </Button>
                    </>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedTask(null)}>
                停止监听
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ScrollArea className="h-full">
              <div className="space-y-3">
                {events.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    {selectedTask ? '等待事件...' : '选择一个任务开始监听'}
                  </div>
                ) : (
                  events.map((event, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.event.started_at).toLocaleTimeString()}
                        </span>
                        <Badge variant={
                          event.kind === 'task_paused' ? 'secondary' :
                          event.kind === 'task_resumed' ? 'default' : 'outline'
                        }>
                          {event.kind}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        {String(event.event.payload?.content || event.event.name || JSON.stringify(event.event.payload))}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="w-80">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              运行中任务
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无运行中的任务
                </p>
              ) : (
                recentTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedTask?.id === task.id
                        ? task.isPaused
                          ? 'border-yellow-400 bg-yellow-50'
                          : 'border-primary bg-primary/10'
                        : 'border-input hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={
                        task.status === 'running' && !task.isPaused ? 'default' :
                        task.isPaused ? 'secondary' :
                        task.status === 'completed' ? 'secondary' : 'destructive'
                      }>
                        {task.isPaused ? '已暂停' : task.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {task.routedSkill}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{task.instruction}</p>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
