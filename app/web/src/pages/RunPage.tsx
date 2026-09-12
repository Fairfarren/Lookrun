import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DeleteOutlined,
    PlusOutlined,
    StopOutlined,
} from '@ant-design/icons';
import {
    App as AntApp,
    Button,
    Card,
    Col,
    Empty,
    Flex,
    Row,
    Select,
    Space,
    Spin,
    Tag,
    theme,
    Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { TaskRecord } from '@lookrun/shared';
import { api, type ModelBrief } from '../api';
import { RunStatusTag, formatDuration } from '../components';
import { RUN_FRAME_COL, RUN_LOG_COL } from '../styles/layout';
import { runProgressText } from '../utils/run-progress';
import { errorText } from '../utils/error-text';
import {
    applyRunWsMessage,
    pendingQueueItems,
    queueAddMissing,
    queueCardTitle,
    startRunSuccessText,
    stepLogPlaceholder,
    type LiveStep,
    type RunViewState,
} from '../utils/run-ws';
import { useWebSocket, type WsMessage } from '../hooks';

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
    return <Tag color='processing'>执行中</Tag>;
}

function StepSuccessTag({ status }: { status: string }) {
    if (status !== 'success') {
        return null;
    }
    return <Tag color='success'>成功</Tag>;
}

function StepFailedTag({ status }: { status: string }) {
    if (status !== 'failed') {
        return null;
    }
    return <Tag color='error'>失败</Tag>;
}

function StepDuration({ item }: { item: LiveStep }) {
    if (!item.record) {
        return null;
    }
    return (
        <Typography.Text type='secondary'>{formatDuration(item.record.durationMs)}</Typography.Text>
    );
}

function StepError({ item }: { item: LiveStep }) {
    if (!item.record?.error) {
        return null;
    }
    return <Typography.Text type='danger'>{item.record.error}</Typography.Text>;
}

function StepUrl({ item }: { item: LiveStep }) {
    if (!item.record?.url) {
        return null;
    }
    return (
        <Typography.Text type='secondary' style={{ fontSize: 12 }}>
            {item.record.url}
        </Typography.Text>
    );
}

function StepLogItem({ item, borderColor }: { item: LiveStep; borderColor: string }) {
    return (
        <div
            style={{
                padding: '10px 0',
                borderBottom: `1px solid ${borderColor}`,
            }}
        >
            <Space orientation='vertical' size={2} style={{ width: '100%' }}>
                <Space wrap>
                    <Tag>{`#${item.stepIndex + 1}`}</Tag>
                    <Typography.Text strong>{item.stepName}</Typography.Text>
                    <Tag color='blue'>{item.action}</Tag>
                    <StepRunningTag status={item.status} />
                    <StepSuccessTag status={item.status} />
                    <StepFailedTag status={item.status} />
                    <StepDuration item={item} />
                </Space>
                <StepError item={item} />
                <StepUrl item={item} />
            </Space>
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
        <div style={{ marginTop: 12 }}>
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
        <Card
            title='实时画面'
            extra={
                <Button danger icon={<StopOutlined />} onClick={onStop}>
                    停止运行
                </Button>
            }
        >
            <FrameBody frame={frame} height={height} />
        </Card>
    );
}

function IdleFrame({ frame, height }: { frame: string | null; height: string }) {
    if (frame) {
        return (
            <Card title='实时画面'>
                <FrameBody frame={frame} height={height} />
            </Card>
        );
    }
    return (
        <Card title='实时画面'>
            <Empty description='当前没有运行中的任务，到「任务」页面发起一次运行' />
        </Card>
    );
}

function FrameBody({ frame, height }: { frame: string | null; height: string }) {
    if (!frame) {
        return (
            <div
                style={{
                    background: '#000',
                    borderRadius: 8,
                    overflow: 'hidden',
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div style={{ color: '#fff' }}>等待浏览器画面...</div>
            </div>
        );
    }
    return (
        <div
            style={{
                background: '#000',
                borderRadius: 8,
                overflow: 'hidden',
                height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <img
                src={`data:image/jpeg;base64,${frame}`}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    display: 'block',
                }}
                alt='实时画面'
            />
        </div>
    );
}

function EmptyQueueHint({ count }: { count: number }) {
    if (count > 0) {
        return null;
    }
    return <Typography.Text type='secondary'>队列为空</Typography.Text>;
}

function EmptyStepHint({ count, running }: { count: number; running: boolean }) {
    if (count > 0) {
        return null;
    }
    return <Typography.Text type='secondary'>{stepLogPlaceholder(running)}</Typography.Text>;
}

function RunProgress({ current }: { current: RunViewState['current'] }) {
    if (!current.run) {
        return null;
    }
    return (
        <Typography.Text type='secondary' data-testid='run-progress'>
            {runProgressText({
                taskName: current.run.taskName,
                currentStepIndex: current.run.currentStepIndex,
                totalSteps: current.run.totalSteps,
            })}
        </Typography.Text>
    );
}

export default function RunPage() {
    const { message } = AntApp.useApp();
    const { token } = theme.useToken();
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
            .catch((error: Error) => message.error(error.message))
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
            message.info('已发送停止指令');
        } catch (error) {
            message.error(errorText(error));
        }
    };

    const submitQueueAdd = async () => {
        try {
            const result = await api.startRun({
                taskId: addTaskId!,
                modelId: addModelId!,
            });
            message.success(startRunSuccessText(result.queued));
        } catch (error) {
            message.error(errorText(error));
        }
    };

    const addToQueue = async () => {
        if (queueAddMissing(addTaskId, addModelId)) {
            message.warning('请选择任务和模型');
            return;
        }
        await submitQueueAdd();
    };

    const moveItem = async (id: number, direction: 'up' | 'down') => {
        try {
            const result = await api.moveQueueItem(id, direction);
            setView((prev) => ({ ...prev, queueItems: result.items }));
        } catch (error) {
            message.error(errorText(error));
        }
    };

    const cancelItem = async (id: number) => {
        try {
            const result = await api.cancelQueueItem(id);
            setView((prev) => ({ ...prev, queueItems: result.items }));
        } catch (error) {
            message.error(errorText(error));
        }
    };

    if (loading) {
        return <Spin style={{ display: 'block', margin: '80px auto' }} />;
    }

    const running = view.current.status === 'running';
    const pendingItems = pendingQueueItems(view.queueItems);
    const frameAreaHeight = 'calc(100vh - 250px)';

    return (
        <Row gutter={16}>
            <Col {...RUN_FRAME_COL}>
                <RunFrame
                    running={running}
                    frame={view.frame}
                    height={frameAreaHeight}
                    onStop={() => void stop()}
                />
                <FinishedBanner finishedStatus={view.finishedStatus} running={running} />
            </Col>
            <Col {...RUN_LOG_COL}>
                <Space orientation='vertical' size={16} style={{ width: '100%' }}>
                    <Card title={queueCardTitle(pendingItems.length)} size='small'>
                        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                            <EmptyQueueHint count={pendingItems.length} />
                            <Flex vertical>
                                {pendingItems.map((item, index) => (
                                    <div
                                        key={item.id}
                                        style={{
                                            padding: '6px 0',
                                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <Space>
                                            <Tag>{`#${index + 1}`}</Tag>
                                            <Typography.Text strong>
                                                {item.taskName}
                                            </Typography.Text>
                                            <Typography.Text
                                                type='secondary'
                                                style={{ fontSize: 12 }}
                                            >
                                                {item.model}
                                            </Typography.Text>
                                        </Space>
                                        <Space size={4}>
                                            <Button
                                                size='small'
                                                type='text'
                                                icon={<ArrowUpOutlined />}
                                                disabled={index === 0}
                                                onClick={() => void moveItem(item.id, 'up')}
                                            />
                                            <Button
                                                size='small'
                                                type='text'
                                                icon={<ArrowDownOutlined />}
                                                disabled={index === pendingItems.length - 1}
                                                onClick={() => void moveItem(item.id, 'down')}
                                            />
                                            <Button
                                                size='small'
                                                type='text'
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => void cancelItem(item.id)}
                                            />
                                        </Space>
                                    </div>
                                ))}
                            </Flex>
                        </div>
                        <div
                            style={{
                                borderTop: `1px solid ${token.colorBorderSecondary}`,
                                paddingTop: 8,
                                marginTop: 8,
                            }}
                        >
                            <Space style={{ width: '100%' }}>
                                <Select
                                    style={{ flex: 1, minWidth: 160 }}
                                    placeholder='选择任务'
                                    value={addTaskId}
                                    onChange={setAddTaskId}
                                    options={tasks.map((task) => ({
                                        label: task.name,
                                        value: task.id,
                                    }))}
                                />
                                <Select
                                    style={{ minWidth: 160 }}
                                    placeholder='选择模型'
                                    value={addModelId}
                                    onChange={setAddModelId}
                                    options={models.map((model) => ({
                                        label: model.name,
                                        value: model.id,
                                    }))}
                                />
                                <Button
                                    type='primary'
                                    icon={<PlusOutlined />}
                                    onClick={() => void addToQueue()}
                                >
                                    添加
                                </Button>
                            </Space>
                        </div>
                    </Card>
                    <Card
                        title={
                            <Space>
                                步骤日志
                                <RunProgress current={view.current} />
                            </Space>
                        }
                    >
                        <div
                            ref={stepListRef}
                            style={{ maxHeight: 'calc(100vh - 510px)', overflowY: 'auto' }}
                        >
                            <EmptyStepHint count={view.steps.length} running={running} />
                            <Flex vertical>
                                {view.steps.map((item) => (
                                    <StepLogItem
                                        key={item.stepIndex}
                                        item={item}
                                        borderColor={token.colorBorderSecondary}
                                    />
                                ))}
                            </Flex>
                        </div>
                    </Card>
                </Space>
            </Col>
        </Row>
    );
}
