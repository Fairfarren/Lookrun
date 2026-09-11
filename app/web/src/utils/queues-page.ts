export function queuesViewState(input: { loading: boolean; count: number }) {
    if (input.loading) {
        return 'loading';
    }
    if (input.count === 0) {
        return 'empty';
    }
    return 'ready';
}

export function startQueueFeedback(input: {
    name: string;
    started: number;
    queued: number;
    errors: string[];
}) {
    if (input.errors.length > 0) {
        return {
            type: 'warning' as const,
            text: `已启动 ${input.started + input.queued} 个任务，${input.errors.length} 个被跳过：${input.errors.join('；')}`,
        };
    }
    return {
        type: 'success' as const,
        text: `已启动队列「${input.name}」：${input.started} 个立即执行，${input.queued} 个排队`,
    };
}
