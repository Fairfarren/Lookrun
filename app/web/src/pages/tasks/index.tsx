import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Flex, Modal, Select, Space, theme, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaskRecord } from '@lookrun/shared';
import { api, type ModelBrief } from './api';
import { formatTime } from '../../components';
import { errorText } from '../../utils/error-text';
import { canStartTask, startTaskSuccess } from './utils';
import { defaultModelId } from '../../utils/default-model-id';
import { queuesViewState } from '../../utils/queues-page';
import { TasksEmpty, TasksLoading, TasksReady } from './components/list-state';

export default function TasksPage() {
    const { message, modal } = AntApp.useApp();
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [runTask, setRunTask] = useState<TaskRecord | null>(null);
    const [models, setModels] = useState<ModelBrief[]>([]);
    const [modelId, setModelId] = useState<string>();
    const [starting, setStarting] = useState(false);

    const loadTasks = () => {
        setLoading(true);
        api.listTasks()
            .then(setTasks)
            .catch((error: Error) => message.error(error.message))
            .finally(() => setLoading(false));
    };

    useEffect(loadTasks, []);

    const openRunModal = (task: TaskRecord) => {
        setRunTask(task);
        api.listModels()
            .then((result) => {
                setModels(result.models);
                setModelId(defaultModelId(result.selected, result.models[0]?.id));
            })
            .catch((error: Error) => message.error(error.message));
    };

    const submitStartRun = async () => {
        try {
            const result = await api.startRun({ taskId: runTask!.id, modelId: modelId! });
            setRunTask(null);
            applyStartResult(result.queued);
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setStarting(false);
        }
    };

    const applyStartResult = (queued: boolean) => {
        const feedback = startTaskSuccess(queued);
        if (feedback.stay) {
            message.success(feedback.message);
            return;
        }
        navigate('/run');
    };

    const startRun = async () => {
        if (!canStartTask(runTask?.id, modelId)) {
            return;
        }
        setStarting(true);
        await submitStartRun();
    };

    const confirmDelete = (task: TaskRecord) => {
        modal.confirm({
            title: `删除任务「${task.name}」？`,
            content: '删除后不可恢复，历史运行记录会保留。',
            okText: '删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                await api.deleteTask(task.id);
                message.success('已删除');
                loadTasks();
            },
        });
    };

    return (
        <Card
            title='任务列表'
            extra={
                <Button
                    type='primary'
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/tasks/new')}
                >
                    新建任务
                </Button>
            }
        >
            <TasksEmpty state={queuesViewState({ loading, count: tasks.length })} />
            <TasksLoading state={queuesViewState({ loading, count: tasks.length })} />
            <TasksReady state={queuesViewState({ loading, count: tasks.length })}>
                <Flex vertical>
                    {tasks.map((task) => (
                        <Flex
                            key={task.id}
                            justify='space-between'
                            align='center'
                            style={{
                                padding: '12px 0',
                                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                        >
                            <Space orientation='vertical' size={2}>
                                <Typography.Text strong>{task.name}</Typography.Text>
                                <Typography.Text type='secondary'>
                                    更新于 {formatTime(task.updatedAt)}
                                </Typography.Text>
                            </Space>
                            <Space>
                                <Button
                                    type='primary'
                                    ghost
                                    icon={<PlayCircleOutlined />}
                                    onClick={() => openRunModal(task)}
                                >
                                    运行
                                </Button>
                                <Button
                                    icon={<EditOutlined />}
                                    onClick={() => navigate(`/tasks/${task.id}`)}
                                >
                                    编辑
                                </Button>
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => confirmDelete(task)}
                                />
                            </Space>
                        </Flex>
                    ))}
                </Flex>
            </TasksReady>

            <Modal
                title={`运行任务「${runTask?.name}」`}
                open={runTask !== null}
                onOk={startRun}
                onCancel={() => setRunTask(null)}
                okText='开始运行'
                cancelText='取消'
                confirmLoading={starting}
            >
                <Space orientation='vertical' style={{ width: '100%' }}>
                    <Typography.Text>选择本次运行使用的 AI 模型：</Typography.Text>
                    <Select
                        style={{ width: '100%' }}
                        value={modelId}
                        onChange={setModelId}
                        options={models.map((model) => ({
                            label: `${model.name}（${model.model}）`,
                            value: model.id,
                        }))}
                    />
                    <Typography.Text type='secondary'>
                        运行过程中可在「实时运行」页面查看画面与步骤日志。
                    </Typography.Text>
                </Space>
            </Modal>
        </Card>
    );
}
