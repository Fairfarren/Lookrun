export function isNewQueueRoute(id: string | undefined) {
    if (id === undefined) {
        return true;
    }
    return id === 'new';
}

export function queueSaveNameError(name: string) {
    if (!name.trim()) {
        return '请填写队列名';
    }
    return null;
}

export function validQueueItems<
    T extends { taskId: number | undefined; modelId: string | undefined },
>(items: T[]) {
    return items.filter((item) => item.taskId && item.modelId);
}

export function queueEditTitle(isNew: boolean) {
    if (isNew) {
        return '新建队列';
    }
    return '编辑队列';
}

export function queueSaveItemsError(count: number) {
    if (count === 0) {
        return '至少添加一个任务';
    }
    return null;
}

export type QueueSavePayload = {
    name: string;
    items: { taskId: number; modelId: string }[];
};

export async function createQueueThenSaveItems(input: {
    payload: QueueSavePayload;
    create: (name: string) => Promise<{ id: number }>;
    update: (id: number, payload: QueueSavePayload) => Promise<unknown>;
}) {
    const created = await input.create(input.payload.name);
    return input.update(created.id, input.payload);
}
