import type { TaskRecord } from '@lookrun/shared';
import { request } from '../../api/request';
import type { ModelBrief, QueueDef, QueueDefWithItems } from '../../api/types';

export type { ModelBrief, QueueDefWithItems };

export const api = {
    listTasks: () => request<TaskRecord[]>('/api/tasks'),
    listModels: () => request<{ models: ModelBrief[]; selected: string | null }>('/api/models'),
    createQueue: (name: string) =>
        request<QueueDef>('/api/queues', {
            method: 'POST',
            body: JSON.stringify({ name }),
        }),
    getQueue: (id: number) => request<QueueDefWithItems>(`/api/queues/${id}`),
    updateQueue: (
        id: number,
        input: { name: string; items: { taskId: number; modelId: string }[] },
    ) =>
        request<QueueDefWithItems>(`/api/queues/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
};
