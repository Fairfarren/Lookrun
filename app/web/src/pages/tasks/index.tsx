import { t, useLocale } from '../../i18n';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaskRecord } from '@lookrun/shared';
import { confirmAction } from '../../components/confirm';
import { formatTime } from '../../components';
import { runConfirmedDelete } from '../../utils/confirmed-delete';
import { BusyButton } from '../../components/busy-button';
import { notify } from '../../components/notify';
import { PageCard } from '../../components/page-card';
import { SelectField } from '../../components/select-field';
import { Button } from '../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';
import { errorText } from '../../utils/error-text';
import { defaultModelId } from '../../utils/default-model-id';
import { queuesViewState } from '../../utils/queues-page';
import { api, type ModelBrief } from './api';
import { TasksEmpty, TasksLoading, TasksReady } from './components/list-state';
import { stayOnTasks } from '../../utils/ui-class';
import { canStartTask, startTaskSuccess } from './utils';

export default function TasksPage() {
    useLocale();

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
            .catch((error: Error) => notify.error(error.message))
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
            .catch((error: Error) => notify.error(error.message));
    };

    const submitStartRun = async () => {
        try {
            const result = await api.startRun({ taskId: runTask!.id, modelId: modelId! });
            setRunTask(null);
            applyStartResult(result.queued);
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setStarting(false);
        }
    };

    const applyStartResult = (queued: boolean) => {
        const feedback = startTaskSuccess(queued);
        if (stayOnTasks(feedback)) {
            notify.success(feedback.message!);
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

    const confirmDelete = async (task: TaskRecord) => {
        const ok = await confirmAction({
            title: t('删除任务「{p0}」？', { p0: task.name }),
            description: t('删除后不可恢复，历史运行记录会保留。'),
            confirmLabel: t('删除'),
            destructive: true,
        });
        await runConfirmedDelete({
            confirmed: ok,
            remove: async () => {
                await api.deleteTask(task.id);
            },
            onSuccess: () => {
                notify.success(t('已删除'));
                loadTasks();
            },
            onError: (message) => notify.error(message),
        });
    };

    return (
        <PageCard
            title={t('任务列表')}
            extra={
                <Button onClick={() => navigate('/tasks/new')}>
                    <Plus />
                    {t('新建任务')}
                </Button>
            }
        >
            <TasksEmpty state={queuesViewState({ loading, count: tasks.length })} />
            <TasksLoading state={queuesViewState({ loading, count: tasks.length })} />
            <TasksReady state={queuesViewState({ loading, count: tasks.length })}>
                <div className='flex flex-col'>
                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className='flex flex-col gap-3 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between'
                        >
                            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                                <span className='font-medium'>{task.name}</span>
                                <span className='text-sm text-muted-foreground'>
                                    {t('更新于')} {formatTime(task.updatedAt)}
                                </span>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <Button variant='outline' onClick={() => openRunModal(task)}>
                                    <Play />
                                    {t('运行')}
                                </Button>
                                <Button
                                    variant='outline'
                                    onClick={() => navigate(`/tasks/${task.id}`)}
                                >
                                    <Pencil />
                                    {t('编辑')}
                                </Button>
                                <Button
                                    variant='destructive'
                                    size='icon'
                                    aria-label={t('删除任务')}
                                    onClick={() => void confirmDelete(task)}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </TasksReady>

            <Dialog open={runTask !== null} onOpenChange={(open) => !open && setRunTask(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('运行任务「{p0}」', { p0: runTask?.name ?? '' })}
                        </DialogTitle>
                        <DialogDescription>{t('选择本次运行使用的 AI 模型：')}</DialogDescription>
                    </DialogHeader>
                    <SelectField
                        className='w-full'
                        value={modelId}
                        onValueChange={setModelId}
                        options={models.map((model) => ({
                            label: `${model.name}（${model.model}）`,
                            value: model.id,
                        }))}
                    />
                    <p className='text-sm text-muted-foreground'>
                        {t('运行过程中可在「实时运行」页面查看画面与步骤日志。')}
                    </p>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setRunTask(null)}>
                            {t('取消')}
                        </Button>
                        <BusyButton busy={starting} onClick={() => void startRun()}>
                            {t('开始运行')}
                        </BusyButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageCard>
    );
}
