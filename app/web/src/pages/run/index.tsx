import { ArrowDown, ArrowUp, Plus, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TaskRecord } from '@lookrun/shared';
import { RunStatusTag, formatDuration } from '../../components';
import { EmptyState } from '../../components/empty-state';
import { LoadingBlock } from '../../components/loading-block';
import { notify } from '../../components/notify';
import { PageCard } from '../../components/page-card';
import { SelectField } from '../../components/select-field';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { RUN_FRAME_CLASS, RUN_LOG_CLASS } from '../../styles/layout';
import { errorText } from '../../utils/error-text';
import { api, type ModelBrief } from './api';
import { useWebSocket, type WsMessage } from './hooks';
import {
    applyRunWsMessage,
    pendingQueueItems,
    queueAddMissing,
    queueCardTitle,
    startRunSuccessText,
    stepLogPlaceholder,
    type LiveStep,
    type RunViewState,
} from './run-ws';
import { optionalIdString } from '../../utils/ui-class';
import { runProgressText } from './utils';

const emptyView = (): RunViewState => ({
    frame: null,
    queueItems: [],
    steps: [],
    current: { status: 'idle', run: null },
    finishedStatus: null,
});

function StepRunningTag({ status }: { status: string }) {
    if (status !== 'running') {
        return null;
    }
    return <Badge variant='running'>执行中</Badge>;
}

function StepSuccessTag({ status }: { status: string }) {
    if (status !== 'success') {
        return null;
    }
    return <Badge variant='success'>成功</Badge>;
}

function StepFailedTag({ status }: { status: string }) {
    if (status !== 'failed') {
        return null;
    }
    return <Badge variant='destructive'>失败</Badge>;
}

function StepDuration({ item }: { item: LiveStep }) {
    if (!item.record) {
        return null;
    }
    return <span className='text-muted-foreground'>{formatDuration(item.record.durationMs)}</span>;
}

function StepError({ item }: { item: LiveStep }) {
    if (!item.record?.error) {
        return null;
    }
    return <span className='text-destructive'>{item.record.error}</span>;
}

function StepUrl({ item }: { item: LiveStep }) {
    if (!item.record?.url) {
        return null;
    }
    return <span className='text-xs text-muted-foreground'>{item.record.url}</span>;
}

function StepLogItem({ item }: { item: LiveStep }) {
    return (
        <div className='border-b py-2.5'>
            <div className='flex flex-col gap-0.5'>
                <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant='outline'>{`#${item.stepIndex + 1}`}</Badge>
                    <span className='font-medium'>{item.stepName}</span>
                    <Badge>{item.action}</Badge>
                    <StepRunningTag status={item.status} />
                    <StepSuccessTag status={item.status} />
                    <StepFailedTag status={item.status} />
                    <StepDuration item={item} />
                </div>
                <StepError item={item} />
                <StepUrl item={item} />
            </div>
        </div>
    );
}

function FinishedBanner({
    finishedStatus,
    running,
}: {
    finishedStatus: string | null;
    running: boolean;
}) {
    if (running) {
        return null;
    }
    return <FinishedBannerInner status={finishedStatus} />;
}

function FinishedBannerInner({ status }: { status: string | null }) {
    if (!status) {
        return null;
    }
    return (
        <div className='mt-3'>
            上次运行结果：
            <RunStatusTag status={status as never} />
        </div>
    );
}

function RunFrame({
    running,
    frame,
    height,
    onStop,
}: {
    running: boolean;
    frame: string | null;
    height: string;
    onStop: () => void;
}) {
    if (running) {
        return <LiveFrame frame={frame} height={height} onStop={onStop} />;
    }
    return <IdleFrame frame={frame} height={height} />;
}

function LiveFrame({
    frame,
    height,
    onStop,
}: {
    frame: string | null;
    height: string;
    onStop: () => void;
}) {
    return (
        <PageCard
            title='实时画面'
            extra={
                <Button variant='destructive' onClick={onStop}>
                    <Square />
                    停止运行
                </Button>
            }
        >
            <FrameBody frame={frame} height={height} />
        </PageCard>
    );
}

function IdleFrame({ frame, height }: { frame: string | null; height: string }) {
    if (frame) {
        return (
            <PageCard title='实时画面'>
                <FrameBody frame={frame} height={height} />
            </PageCard>
        );
    }
    return (
        <PageCard title='实时画面'>
            <EmptyState text='当前没有运行中的任务，到「任务」页面发起一次运行' />
        </PageCard>
    );
}

function FrameBody({ frame, height }: { frame: string | null; height: string }) {
    if (!frame) {
        return (
            <div
                className='flex items-center justify-center overflow-hidden rounded-lg bg-black text-white'
                style={{ height }}
            >
                等待浏览器画面...
            </div>
        );
    }
    return (
        <div
            className='flex items-center justify-center overflow-hidden rounded-lg bg-black'
            style={{ height }}
        >
            <img
                src={`data:image/jpeg;base64,${frame}`}
                className='block max-h-full max-w-full object-contain'
                alt='实时画面'
            />
        </div>
    );
}

function EmptyQueueHint({ count }: { count: number }) {
    if (count > 0) {
        return null;
    }
    return <p className='text-sm text-muted-foreground'>队列为空</p>;
}

function EmptyStepHint({ count, running }: { count: number; running: boolean }) {
    if (count > 0) {
        return null;
    }
    return <p className='text-sm text-muted-foreground'>{stepLogPlaceholder(running)}</p>;
}

function RunProgress({ current }: { current: RunViewState['current'] }) {
    if (!current.run) {
        return null;
    }
    return (
        <span className='text-sm text-muted-foreground' data-testid='run-progress'>
            {runProgressText({
                taskName: current.run.taskName,
                currentStepIndex: current.run.currentStepIndex,
                totalSteps: current.run.totalSteps,
            })}
        </span>
    );
}

export default function RunPage() {
    const [view, setView] = useState(emptyView);
    const [loading, setLoading] = useState(true);
    const stepListRef = useRef<HTMLDivElement>(null);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [models, setModels] = useState<ModelBrief[]>([]);
    const [addTaskId, setAddTaskId] = useState<number>();
    const [addModelId, setAddModelId] = useState<string>();

    useEffect(() => {
        api.currentRun()
            .then((current) => setView((prev) => ({ ...prev, current })))
            .catch((error: Error) => notify.error(error.message))
            .finally(() => setLoading(false));
        api.listQueue()
            .then((result) => setView((prev) => ({ ...prev, queueItems: result.items })))
            .catch(() => {});
        api.listTasks()
            .then(setTasks)
            .catch(() => {});
        api.listModels()
            .then((result) => {
                setModels(result.models);
                setAddModelId(result.selected ?? result.models[0]?.id);
            })
            .catch(() => {});
    }, []);

    const handleMessage = (msg: WsMessage) => {
        setView((prev) => applyRunWsMessage(prev, msg));
    };

    useWebSocket(handleMessage);

    useEffect(() => {
        stepListRef.current?.scrollTo({
            top: stepListRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [view.steps.length]);

    const stop = async () => {
        try {
            await api.stopRun();
            notify.info('已发送停止指令');
        } catch (error) {
            notify.error(errorText(error));
        }
    };

    const submitQueueAdd = async () => {
        try {
            const result = await api.startRun({
                taskId: addTaskId!,
                modelId: addModelId!,
            });
            notify.success(startRunSuccessText(result.queued));
        } catch (error) {
            notify.error(errorText(error));
        }
    };

    const addToQueue = async () => {
        if (queueAddMissing(addTaskId, addModelId)) {
            notify.warning('请选择任务和模型');
            return;
        }
        await submitQueueAdd();
    };

    const moveItem = async (id: number, direction: 'up' | 'down') => {
        try {
            const result = await api.moveQueueItem(id, direction);
            setView((prev) => ({ ...prev, queueItems: result.items }));
        } catch (error) {
            notify.error(errorText(error));
        }
    };

    const cancelItem = async (id: number) => {
        try {
            const result = await api.cancelQueueItem(id);
            setView((prev) => ({ ...prev, queueItems: result.items }));
        } catch (error) {
            notify.error(errorText(error));
        }
    };

    if (loading) {
        return <LoadingBlock className='py-20' />;
    }

    const running = view.current.status === 'running';
    const pendingItems = pendingQueueItems(view.queueItems);
    const frameAreaHeight = 'calc(100vh - 250px)';

    return (
        <div className='flex flex-col gap-4 lg:flex-row'>
            <div className={RUN_FRAME_CLASS}>
                <RunFrame
                    running={running}
                    frame={view.frame}
                    height={frameAreaHeight}
                    onStop={() => void stop()}
                />
                <FinishedBanner finishedStatus={view.finishedStatus} running={running} />
            </div>
            <div className={`${RUN_LOG_CLASS} flex flex-col gap-4`}>
                <PageCard title={queueCardTitle(pendingItems.length)}>
                    <div className='max-h-[180px] overflow-y-auto'>
                        <EmptyQueueHint count={pendingItems.length} />
                        <div className='flex flex-col'>
                            {pendingItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    className='flex items-center justify-between border-b py-1.5'
                                >
                                    <div className='flex items-center gap-2'>
                                        <Badge variant='outline'>{`#${index + 1}`}</Badge>
                                        <span className='font-medium'>{item.taskName}</span>
                                        <span className='text-xs text-muted-foreground'>
                                            {item.model}
                                        </span>
                                    </div>
                                    <div className='flex gap-1'>
                                        <Button
                                            size='icon-xs'
                                            variant='ghost'
                                            disabled={index === 0}
                                            aria-label='上移'
                                            onClick={() => void moveItem(item.id, 'up')}
                                        >
                                            <ArrowUp />
                                        </Button>
                                        <Button
                                            size='icon-xs'
                                            variant='ghost'
                                            disabled={index === pendingItems.length - 1}
                                            aria-label='下移'
                                            onClick={() => void moveItem(item.id, 'down')}
                                        >
                                            <ArrowDown />
                                        </Button>
                                        <Button
                                            size='icon-xs'
                                            variant='ghost'
                                            aria-label='取消排队'
                                            onClick={() => void cancelItem(item.id)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className='mt-2 flex flex-wrap items-center gap-2 border-t pt-2'>
                        <SelectField
                            className='min-w-[160px] flex-1'
                            placeholder='选择任务'
                            value={optionalIdString(addTaskId)}
                            onValueChange={(value) => setAddTaskId(Number(value))}
                            options={tasks.map((task) => ({
                                label: task.name,
                                value: String(task.id),
                            }))}
                        />
                        <SelectField
                            className='min-w-[160px]'
                            placeholder='选择模型'
                            value={addModelId}
                            onValueChange={setAddModelId}
                            options={models.map((model) => ({
                                label: model.name,
                                value: model.id,
                            }))}
                        />
                        <Button onClick={() => void addToQueue()}>
                            <Plus />
                            添加
                        </Button>
                    </div>
                </PageCard>
                <PageCard
                    title={
                        <span className='inline-flex items-center gap-2'>
                            步骤日志
                            <RunProgress current={view.current} />
                        </span>
                    }
                >
                    <div ref={stepListRef} className='max-h-[calc(100vh-510px)] overflow-y-auto'>
                        <EmptyStepHint count={view.steps.length} running={running} />
                        <div className='flex flex-col'>
                            {view.steps.map((item) => (
                                <StepLogItem key={item.stepIndex} item={item} />
                            ))}
                        </div>
                    </div>
                </PageCard>
            </div>
        </div>
    );
}
