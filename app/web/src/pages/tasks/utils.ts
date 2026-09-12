export function startTaskSuccess(queued: boolean) {
    if (queued) {
        return { message: '已加入队列排队，可到「实时运行」页查看', stay: true };
    }
    return { message: null, stay: false };
}

export function canStartTask(taskId: number | undefined, modelId: string | undefined) {
    if (!taskId) {
        return false;
    }
    if (!modelId) {
        return false;
    }
    return true;
}
