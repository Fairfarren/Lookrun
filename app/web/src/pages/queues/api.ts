import { request } from '../../api/request';
import type { QueueDef } from '../../api/types';

export type { QueueDef };

export const api = {
    listQueues: () => request<{ items: QueueDef[] }>('/api/queues'),
    deleteQueue: (id: number) =>
        request<{ ok: boolean }>(`/api/queues/${id}`, { method: 'DELETE' }),
    startQueue: (id: number) =>
        request<{ started: number; queued: number; errors: string[] }>(`/api/queues/${id}/start`, {
            method: 'POST',
        }),
};
