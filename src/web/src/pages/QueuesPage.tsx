import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Empty, Flex, Space, Spin, theme, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueDef } from '../api';

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

    const startQueue = async (queue: QueueDef) => {
        setStarting(queue.id);
        try {
            const result = await api.startQueue(queue.id);
            if (result.errors.length > 0) {
                message.warning(
                    `已启动 ${result.started + result.queued} 个任务，${result.errors.length} 个被跳过：${result.errors.join('；')}`,
                );
            } else {
                message.success(
                    `已启动队列「${queue.name}」：${result.started} 个立即执行，${result.queued} 个排队`,
                );
            }
            navigate('/run');
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setStarting(null);
        }
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
            {queues.length === 0 && !loading ? (
                <Empty description='还没有队列，点击右上角新建一个' />
            ) : loading ? (
                <Spin style={{ display: 'block', margin: '40px auto' }} />
            ) : (
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
            )}
        </Card>
    );
}
