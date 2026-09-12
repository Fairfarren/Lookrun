import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmAction } from '../../components/confirm';
import { BusyButton } from '../../components/busy-button';
import { notify } from '../../components/notify';
import { PageCard } from '../../components/page-card';
import { Button } from '../../components/ui/button';
import { errorText } from '../../utils/error-text';
import { queuesViewState } from '../../utils/queues-page';
import { api, type QueueDef } from './api';
import { QueuesEmpty, QueuesLoading, QueuesReady } from './components/list-state';
import { startQueueFeedback } from './utils';

export default function QueuesPage() {
    const navigate = useNavigate();
    const [queues, setQueues] = useState<QueueDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState<number | null>(null);

    const load = () => {
        setLoading(true);
        api.listQueues()
            .then((r) => setQueues(r.items))
            .catch((e: Error) => notify.error(e.message))
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
            notify.warning(feedback.text);
            return;
        }
        notify.success(feedback.text);
    };

    const submitStartQueue = async (queue: QueueDef) => {
        try {
            const result = await api.startQueue(queue.id);
            showStartFeedback(queue, result);
            navigate('/run');
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setStarting(null);
        }
    };

    const startQueue = async (queue: QueueDef) => {
        setStarting(queue.id);
        await submitStartQueue(queue);
    };

    const confirmDelete = async (queue: QueueDef) => {
        const ok = await confirmAction({
            title: `删除队列「${queue.name}」？`,
            description: '只删除队列定义，不影响里面的任务。',
            confirmLabel: '删除',
            destructive: true,
        });
        if (!ok) {
            return;
        }
        await api.deleteQueue(queue.id);
        notify.success('已删除');
        load();
    };

    return (
        <PageCard
            title='队列列表'
            extra={
                <Button onClick={() => navigate('/queues/new')}>
                    <Plus />
                    新建队列
                </Button>
            }
        >
            <QueuesEmpty state={queuesViewState({ loading, count: queues.length })} />
            <QueuesLoading state={queuesViewState({ loading, count: queues.length })} />
            <QueuesReady state={queuesViewState({ loading, count: queues.length })}>
                <div className='flex flex-col'>
                    {queues.map((queue) => (
                        <div
                            key={queue.id}
                            className='flex flex-col gap-3 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between'
                        >
                            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                                <span className='font-medium'>{queue.name}</span>
                                <span className='text-sm text-muted-foreground'>
                                    更新于{' '}
                                    {new Date(queue.updatedAt).toLocaleString('zh-CN', {
                                        hour12: false,
                                    })}
                                </span>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <BusyButton
                                    variant='outline'
                                    busy={starting === queue.id}
                                    onClick={() => void startQueue(queue)}
                                >
                                    <Play />
                                    开始
                                </BusyButton>
                                <Button
                                    variant='outline'
                                    onClick={() => navigate(`/queues/${queue.id}`)}
                                >
                                    <Pencil />
                                    编辑
                                </Button>
                                <Button
                                    variant='destructive'
                                    size='icon'
                                    aria-label='删除队列'
                                    onClick={() => void confirmDelete(queue)}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </QueuesReady>
        </PageCard>
    );
}
