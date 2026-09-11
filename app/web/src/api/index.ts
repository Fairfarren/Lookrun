import type {
    AndroidAppRecord,
    AndroidDeviceRecord,
    RunRecord,
    RunStepRecord,
    SystemInfo,
    TaskRecord,
} from '@lookrun/shared';

export function jsonRequestHeaders(hasBody: boolean) {
    if (!hasBody) {
        return undefined;
    }
    return { 'Content-Type': 'application/json' };
}

export function requestErrorText(body: { error?: string; errors?: string[] }, status: number) {
    if (body.errors && body.errors.length > 0) {
        return body.errors.join('；');
    }
    if (body.error) {
        return body.error;
    }
    return `请求失败（${status}）`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        headers: jsonRequestHeaders(Boolean(options?.body)),
        ...options,
    });
    const body = (await response.json()) as T & {
        error?: string;
        errors?: string[];
    };
    if (!response.ok) {
        throw new Error(requestErrorText(body, response.status));
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

export interface QueueItem {
    id: number;
    taskId: number;
    taskName: string;
    modelId: string;
    model: string;
    status: 'pending' | 'running' | 'done' | 'cancelled';
    position: number;
    runId: number | null;
    createdAt: string;
}

export interface QueueDef {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface QueueDefWithItems extends QueueDef {
    items: {
        id: number;
        queueId: number;
        taskId: number;
        modelId: string;
        position: number;
        createdAt: string;
    }[];
}

export const api = {
    // 任务
    listTasks: () => request<TaskRecord[]>('/api/tasks'),
    getTask: (id: number) => request<TaskRecord>(`/api/tasks/${id}`),
    createTask: (input: { name: string; yaml: string }) =>
        request<TaskRecord>('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updateTask: (id: number, input: { name: string; yaml: string }) =>
        request<TaskRecord>(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deleteTask: (id: number) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
    validateYaml: (yaml: string) =>
        request<{ ok: boolean; errors: string[] }>('/api/tasks/validate', {
            method: 'POST',
            body: JSON.stringify({ yaml }),
        }),

    // 运行
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
    listRuns: (page: { limit: number; offset: number }) =>
        request<{ list: RunRecord[]; total: number }>(
            `/api/runs?limit=${page.limit}&offset=${page.offset}`,
        ),
    runDetail: (id: number) =>
        request<{ run: RunRecord; steps: RunStepRecord[] }>(`/api/runs/${id}`),

    // 运行队列
    listQueue: () => request<{ items: QueueItem[] }>('/api/queue'),
    moveQueueItem: (id: number, direction: 'up' | 'down') =>
        request<{ items: QueueItem[] }>(`/api/queue/${id}/move`, {
            method: 'POST',
            body: JSON.stringify({ direction }),
        }),
    cancelQueueItem: (id: number) =>
        request<{ items: QueueItem[] }>(`/api/queue/${id}`, { method: 'DELETE' }),

    // 命名队列
    listQueues: () => request<{ items: QueueDef[] }>('/api/queues'),
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
    deleteQueue: (id: number) =>
        request<{ ok: boolean }>(`/api/queues/${id}`, { method: 'DELETE' }),
    startQueue: (id: number) =>
        request<{ started: number; queued: number; errors: string[] }>(`/api/queues/${id}/start`, {
            method: 'POST',
        }),

    // 模型
    listModels: () => request<{ models: ModelBrief[]; selected: string | null }>('/api/models'),
    selectModel: (id: string) =>
        request<{ ok: boolean }>('/api/models/select', {
            method: 'PUT',
            body: JSON.stringify({ id }),
        }),
    checkModel: (id: string) =>
        request<{ ok: boolean; message: string }>(`/api/models/${id}/check`, {
            method: 'POST',
        }),

    // 变量
    getVariables: () => request<Record<string, string>>('/api/variables'),
    saveVariables: (variables: Record<string, string>) =>
        request<{ ok: boolean }>('/api/variables', {
            method: 'PUT',
            body: JSON.stringify({ variables }),
        }),

    // 系统信息
    systemInfo: () => request<SystemInfo>('/api/system'),
    listAndroidDevices: () =>
        request<{ devices: AndroidDeviceRecord[] }>('/api/system/android-devices'),
    listAndroidApps: (deviceId: string) =>
        request<{ apps: AndroidAppRecord[] }>(
            `/api/system/android-apps?deviceId=${encodeURIComponent(deviceId)}`,
        ),
    checkAndroidDevice: (deviceId: string) =>
        request<{ ok: true; device: AndroidDeviceRecord } | { ok: false; message: string }>(
            '/api/system/android-devices/check',
            {
                method: 'POST',
                body: JSON.stringify({ deviceId }),
            },
        ),
    storageStats: () => request<StorageStats>('/api/system/storage'),
    cleanupStorage: () =>
        request<{ deletedRuns: number; freedBytes: number }>('/api/system/storage/cleanup', {
            method: 'POST',
        }),
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
