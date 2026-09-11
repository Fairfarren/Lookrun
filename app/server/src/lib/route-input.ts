export function taskWriteError(body: { name?: string; yaml?: string }) {
    if (!body.name?.trim() || !body.yaml?.trim()) {
        return '任务名和 YAML 内容不能为空';
    }
    return null;
}

export function queueNameError(name: string | undefined) {
    if (!name?.trim()) {
        return '队列名不能为空';
    }
    return null;
}

export function moveDirectionError(direction: string | undefined) {
    if (direction === 'up') {
        return null;
    }
    if (direction === 'down') {
        return null;
    }
    return 'direction 必须是 up 或 down';
}

export function variablesBodyError(variables: unknown) {
    if (!variables) {
        return 'variables 必须是对象';
    }
    if (typeof variables !== 'object') {
        return 'variables 必须是对象';
    }
    return null;
}

export function modelSelectError(id: string | undefined, exists: boolean) {
    if (!id) {
        return '模型不存在';
    }
    if (!exists) {
        return '模型不存在';
    }
    return null;
}

export function runStartBodyError(taskId: number | undefined, modelId: string | undefined) {
    if (!taskId) {
        return '缺少 taskId 或 modelId';
    }
    if (!modelId) {
        return '缺少 taskId 或 modelId';
    }
    return null;
}

export function missingIdError(id: string | undefined, message: string) {
    if (!id?.trim()) {
        return message;
    }
    return null;
}

export function queueItemsOrEmpty(items: { taskId: number; modelId: string }[] | undefined) {
    if (!items) {
        return [];
    }
    return items;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    if (parsed <= 0) {
        return fallback;
    }
    return parsed;
}

export function parseRunListQuery(input: {
    limit: string | undefined;
    offset: string | undefined;
}) {
    return {
        limit: Math.min(parsePositiveInt(input.limit, 20), 100),
        offset: parsePositiveInt(input.offset, 0),
    };
}
