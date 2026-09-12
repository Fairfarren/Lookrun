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

export interface StorageStats {
    screenshotsBytes: number;
    reportsBytes: number;
    databaseBytes: number;
    totalBytes: number;
    runCount: number;
}
