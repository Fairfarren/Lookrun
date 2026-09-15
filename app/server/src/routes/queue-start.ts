import { ScriptInvalidError } from '@server/services/runner';
import { errorText } from '@server/lib/error-text';

export type QueueStartCounts = {
    started: number;
    queued: number;
    errors: string[];
};

export function namedQueueUnavailable(queue: { items: unknown[] } | null) {
    if (!queue) {
        return { status: 404 as const, error: '队列不存在' };
    }
    if (queue.items.length === 0) {
        return { status: 400 as const, error: '队列为空，没有可执行的任务' };
    }
    return null;
}

export function queueItemMissingError(taskId: number) {
    return `任务 #${taskId} 不存在，已跳过`;
}

export function queueItemStartError(taskName: string, error: unknown) {
    if (error instanceof ScriptInvalidError) {
        return `任务「${taskName}」校验失败：${error.errors.join('；')}`;
    }
    return `任务「${taskName}」启动失败：${errorText(error)}`;
}

export function applyQueueItemStart(counts: QueueStartCounts, queued: boolean) {
    if (queued) {
        return { ...counts, queued: counts.queued + 1 };
    }
    return { ...counts, started: counts.started + 1 };
}

export function startNamedQueueItems(input: {
    items: { taskId: number; modelId: string }[];
    getTask: (taskId: number) => { id: number; name: string; yaml: string } | null;
    start: (
        task: { id: number; name: string; yaml: string },
        modelId: string,
    ) => { queued: boolean };
}) {
    let counts: QueueStartCounts = { started: 0, queued: 0, errors: [] };
    for (const item of input.items) {
        const task = input.getTask(item.taskId);
        if (!task) {
            counts.errors.push(queueItemMissingError(item.taskId));
            continue;
        }
        try {
            counts = applyQueueItemStart(counts, input.start(task, item.modelId).queued);
        } catch (error) {
            counts.errors.push(queueItemStartError(task.name, error));
        }
    }
    return counts;
}
