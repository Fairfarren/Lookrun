import type { RunRecord, RunStepRecord, SystemInfo, TaskRecord } from '../../shared/types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const body = (await response.json()) as T & { error?: string; errors?: string[] };
  if (!response.ok) {
    const detail = body.errors?.length ? body.errors.join('；') : body.error;
    throw new Error(detail ?? `请求失败（${response.status}）`);
  }
  return body;
}

export interface ModelBrief {
  id: string;
  name: string;
  model: string;
}

export interface CurrentRunState {
  status: 'idle' | 'running';
  run: {
    runId: number;
    taskName: string;
    model: string;
    startedAt: string;
    currentStepIndex: number;
    totalSteps: number;
  } | null;
}

export const api = {
  // 任务
  listTasks: () => request<TaskRecord[]>('/api/tasks'),
  getTask: (id: number) => request<TaskRecord>(`/api/tasks/${id}`),
  createTask: (input: { name: string; yaml: string }) =>
    request<TaskRecord>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: number, input: { name: string; yaml: string }) =>
    request<TaskRecord>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteTask: (id: number) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  validateYaml: (yaml: string) =>
    request<{ ok: boolean; errors: string[] }>('/api/tasks/validate', { method: 'POST', body: JSON.stringify({ yaml }) }),

  // 运行
  startRun: (input: { taskId: number; modelId: string }) =>
    request<{ runId: number }>('/api/runs', { method: 'POST', body: JSON.stringify(input) }),
  currentRun: () => request<CurrentRunState>('/api/runs/current'),
  stopRun: () => request<{ ok: boolean }>('/api/runs/current/stop', { method: 'POST' }),
  listRuns: (page: { limit: number; offset: number }) =>
    request<{ list: RunRecord[]; total: number }>(`/api/runs?limit=${page.limit}&offset=${page.offset}`),
  runDetail: (id: number) => request<{ run: RunRecord; steps: RunStepRecord[] }>(`/api/runs/${id}`),

  // 模型
  listModels: () => request<{ models: ModelBrief[]; selected: string | null }>('/api/models'),
  selectModel: (id: string) => request<{ ok: boolean }>('/api/models/select', { method: 'PUT', body: JSON.stringify({ id }) }),
  checkModel: (id: string) => request<{ ok: boolean; message: string }>(`/api/models/${id}/check`, { method: 'POST' }),

  // 变量
  getVariables: () => request<Record<string, string>>('/api/variables'),
  saveVariables: (variables: Record<string, string>) =>
    request<{ ok: boolean }>('/api/variables', { method: 'PUT', body: JSON.stringify({ variables }) }),

  // 系统信息
  systemInfo: () => request<SystemInfo>('/api/system'),
  storageStats: () => request<StorageStats>('/api/system/storage'),
  cleanupStorage: () => request<{ deletedRuns: number; freedBytes: number }>('/api/system/storage/cleanup', { method: 'POST' }),
};

export interface StorageStats {
  screenshotsBytes: number;
  reportsBytes: number;
  databaseBytes: number;
  totalBytes: number;
  runCount: number;
}

export function screenshotUrl(relativePath: string) {
  return `/api/screenshots/${relativePath}`;
}
