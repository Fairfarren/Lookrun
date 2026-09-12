import type { RunStepRecord } from '@lookrun/shared';
import type { CurrentRunState, QueueItem } from '../../api/types';
import type { WsMessage } from './hooks';

export interface LiveStep {
    stepIndex: number;
    stepName: string;
    action: string;
    status: 'running' | 'success' | 'failed';
    record?: RunStepRecord;
}

export type RunViewState = {
    frame: string | null;
    queueItems: QueueItem[];
    steps: LiveStep[];
    current: CurrentRunState;
    finishedStatus: string | null;
};

export function withRunningStepIndex(
    current: CurrentRunState,
    stepIndex: number,
    totalSteps: number,
): CurrentRunState {
    if (!current.run) {
        return current;
    }
    return {
        status: 'running',
        run: {
            ...current.run,
            currentStepIndex: stepIndex,
            totalSteps,
        },
    };
}

export function applyStepStart(
    state: RunViewState,
    msg: Extract<WsMessage, { type: 'step-start' }>,
): RunViewState {
    return {
        ...state,
        steps: [
            ...state.steps,
            {
                stepIndex: msg.stepIndex,
                stepName: msg.stepName,
                action: msg.action,
                status: 'running',
            },
        ],
        current: withRunningStepIndex(state.current, msg.stepIndex, msg.totalSteps),
    };
}

export function applyStepRecord(steps: LiveStep[], step: RunStepRecord) {
    return steps.map((item) => {
        if (item.stepIndex !== step.stepIndex) {
            return item;
        }
        return { ...item, status: step.status, record: step };
    });
}

export function applyRunRecord(state: RunViewState, msg: Extract<WsMessage, { type: 'run' }>) {
    if (msg.run.status === 'running') {
        return {
            ...state,
            current: {
                status: 'running' as const,
                run: {
                    runId: msg.run.id,
                    taskName: msg.run.taskName,
                    model: msg.run.model,
                    startedAt: msg.run.startedAt,
                    currentStepIndex: -1,
                    totalSteps: 0,
                },
            },
            steps: [],
            finishedStatus: null,
        };
    }
    return {
        ...state,
        current: { status: 'idle' as const, run: null },
        finishedStatus: msg.run.status,
    };
}

export function applyRunWsMessage(state: RunViewState, msg: WsMessage): RunViewState {
    if (msg.type === 'frame') {
        return { ...state, frame: msg.data };
    }
    return applyRunWsMessageAfterFrame(state, msg);
}

export function applyRunWsMessageAfterFrame(state: RunViewState, msg: WsMessage): RunViewState {
    if (msg.type === 'queue') {
        return { ...state, queueItems: msg.items };
    }
    return applyRunWsMessageAfterQueue(state, msg);
}

export function applyRunWsMessageAfterQueue(state: RunViewState, msg: WsMessage): RunViewState {
    if (msg.type === 'step-start') {
        return applyStepStart(state, msg);
    }
    return applyRunWsMessageAfterStepStart(state, msg);
}

export function applyRunWsMessageAfterStepStart(state: RunViewState, msg: WsMessage): RunViewState {
    if (msg.type === 'step') {
        return { ...state, steps: applyStepRecord(state.steps, msg.step) };
    }
    return applyRunWsMessageRun(state, msg);
}

export function applyRunWsMessageRun(state: RunViewState, msg: WsMessage): RunViewState {
    if (msg.type === 'run') {
        return applyRunRecord(state, msg);
    }
    return state;
}

export function queueAddMissing(taskId: number | undefined, modelId: string | undefined) {
    if (!taskId) {
        return true;
    }
    if (!modelId) {
        return true;
    }
    return false;
}

export function startRunSuccessText(queued: boolean) {
    if (queued) {
        return '已加入队列';
    }
    return '已开始运行';
}

export function pendingQueueItems(items: QueueItem[]) {
    return items.filter((item) => item.status === 'pending');
}

export function queueCardTitle(pendingCount: number) {
    if (pendingCount > 0) {
        return `任务队列（${pendingCount} 个待执行）`;
    }
    return '任务队列';
}

export function stepLogPlaceholder(running: boolean) {
    if (running) {
        return '准备中...';
    }
    return '暂无步骤';
}
