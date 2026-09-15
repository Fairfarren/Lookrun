import type { TaskRecord } from '@lookrun/shared';
import { request } from '@/api/request';
import type { ModelBrief, QueueItem } from '@/api/types';

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
    deleteTask: (id: number) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
};
