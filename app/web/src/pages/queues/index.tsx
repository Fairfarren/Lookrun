import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Flex, Space, theme, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueDef } from './api';
import { errorText } from '../../utils/error-text';
import { queuesViewState } from '../../utils/queues-page';
import { startQueueFeedback } from './utils';
import { QueuesEmpty, QueuesLoading, QueuesReady } from './components/list-state';

export default function QueuesPage() {
    const { message, modal } = AntApp.useApp();
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [queues, setQueues] = useState<QueueDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState<number | null>(null);

    const load = () => {
        setLoading(true);
        api.listQueues()
            .then((r) => setQueues(r.items))
            .catch((e: Error) => message.error(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const showStartFeedback = (
        queue: QueueDef,
        result: { started: number; queued: number; errors: string[] },
    ) => {
        const feedback = startQueueFeedback({
            name: queue.name,
            started: result.started,
            queued: result.queued,
            errors: result.errors,
        });
        if (feedback.type === 'warning') {
            message.warning(feedback.text);
            return;
        }
        message.success(feedback.text);
    };

    const submitStartQueue = async (queue: QueueDef) => {
        try {
            const result = await api.startQueue(queue.id);
            showStartFeedback(queue, result);
            navigate('/run');
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setStarting(null);
        }
    };

    const startQueue = async (queue: QueueDef) => {
        setStarting(queue.id);
        await submitStartQueue(queue);
    };

    const confirmDelete = (queue: QueueDef) => {
        modal.confirm({
            title: `删除队列「${queue.name}」？`,
            content: '只删除队列定义，不影响里面的任务。',
            okText: '删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                await api.deleteQueue(queue.id);
                message.success('已删除');
                load();
            },
        });
    };

    return (
        <Card
            title='队列列表'
            extra={
                <Button
                    type='primary'
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/queues/new')}
                >
                    新建队列
                </Button>
            }
        >
            <QueuesEmpty state={queuesViewState({ loading, count: queues.length })} />
            <QueuesLoading state={queuesViewState({ loading, count: queues.length })} />
            <QueuesReady state={queuesViewState({ loading, count: queues.length })}>
                <Flex vertical>
                    {queues.map((queue) => (
                        <Flex
                            key={queue.id}
                            justify='space-between'
                            align='center'
                            style={{
                                padding: '12px 0',
                                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                        >
                            <Space orientation='vertical' size={2}>
                                <Typography.Text strong>{queue.name}</Typography.Text>
                                <Typography.Text type='secondary'>
                                    更新于{' '}
                                    {new Date(queue.updatedAt).toLocaleString('zh-CN', {
                                        hour12: false,
                                    })}
                                </Typography.Text>
                            </Space>
                            <Space>
                                <Button
                                    type='primary'
                                    ghost
                                    icon={<PlayCircleOutlined />}
                                    loading={starting === queue.id}
                                    onClick={() => startQueue(queue)}
                                >
                                    开始
                                </Button>
                                <Button
                                    icon={<EditOutlined />}
                                    onClick={() => navigate(`/queues/${queue.id}`)}
                                >
                                    编辑
                                </Button>
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => confirmDelete(queue)}
                                />
                            </Space>
                        </Flex>
                    ))}
                </Flex>
            </QueuesReady>
        </Card>
    );
}
