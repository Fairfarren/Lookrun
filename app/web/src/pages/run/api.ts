import type { TaskRecord } from '@lookrun/shared';
import { request } from '../../api/request';
import type { CurrentRunState, ModelBrief, QueueItem } from '../../api/types';

export type { ModelBrief };

export const api = {
    listTasks: () => request<TaskRecord[]>('/api/tasks'),
    listModels: () => request<{ models: ModelBrief[]; selected: string | null }>('/api/models'),
    startRun: (input: { taskId: number; modelId: string }) =>
        request<{ queued: false; runId: number } | { queued: true; queueItem: QueueItem }>(
            '/api/runs',
            {
                method: 'POST',
                body: JSON.stringify(input),
            },
        ),
    currentRun: () => request<CurrentRunState>('/api/runs/current'),
    stopRun: () => request<{ ok: boolean }>('/api/runs/current/stop', { method: 'POST' }),
    listQueue: () => request<{ items: QueueItem[] }>('/api/queue'),
    moveQueueItem: (id: number, direction: 'up' | 'down') =>
        request<{ items: QueueItem[] }>(`/api/queue/${id}/move`, {
            method: 'POST',
            body: JSON.stringify({ direction }),
        }),
    cancelQueueItem: (id: number) =>
        request<{ items: QueueItem[] }>(`/api/queue/${id}`, { method: 'DELETE' }),
};
