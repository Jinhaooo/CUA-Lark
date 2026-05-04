const API_BASE = '/api';

export interface TaskSummary {
  id: string;
  instruction: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalTokens?: number;
  finishedReason?: string;
  routedSkill?: string;
}

export interface TaskDetail extends TaskSummary {
  params: Record<string, unknown>;
}

export interface TraceEvent {
  id: string;
  test_run_id: string;
  parent_id?: string;
  kind: string;
  name: string;
  status: 'running' | 'passed' | 'failed';
  started_at: number;
  ended_at?: number;
  payload?: Record<string, unknown>;
}

export interface SkillInfo {
  name: string;
  description: string;
  toolWhitelistCount: number;
  fewShotCount: number;
}

export interface SkillDetail extends SkillInfo {
  toolWhitelist?: string[];
  maxLoopIterations: number;
  finishCriteria: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  a11y: 'enabled' | 'disabled';
  ocr: 'available' | 'unavailable';
  vlm: 'available' | 'unavailable';
}

export interface CreateTaskRequest {
  instruction: string;
  params?: Record<string, unknown>;
}

export interface CreateTaskResponse {
  taskId: string;
  status: 'queued';
}

export async function createTask(request: CreateTaskRequest): Promise<CreateTaskResponse> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error('Failed to create task');
  }
  return response.json();
}

export async function listTasks(
  params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ tasks: TaskSummary[]; total: number }> {
  const url = new URL(`${API_BASE}/tasks`);
  if (params?.status) url.searchParams.set('status', params.status);
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.offset) url.searchParams.set('offset', String(params.offset));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return response.json();
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`);
  if (!response.ok) {
    throw new Error('Task not found');
  }
  return response.json();
}

export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete task');
  }
}

export async function getTrace(taskId: string, since?: string): Promise<TraceEvent[]> {
  const url = new URL(`${API_BASE}/tasks/${taskId}/trace`);
  if (since) url.searchParams.set('since', since);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch trace');
  }
  return response.json();
}

export async function listSkills(): Promise<SkillInfo[]> {
  const response = await fetch(`${API_BASE}/skills`);
  if (!response.ok) {
    throw new Error('Failed to fetch skills');
  }
  return response.json();
}

export async function getSkill(name: string): Promise<SkillDetail> {
  const response = await fetch(`${API_BASE}/skills/${name}`);
  if (!response.ok) {
    throw new Error('Skill not found');
  }
  return response.json();
}

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error('Failed to fetch health status');
  }
  return response.json();
}

export function createEventSource(taskId: string): EventSource {
  return new EventSource(`${API_BASE}/tasks/${taskId}/stream`);
}
