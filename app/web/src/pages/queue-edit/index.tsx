import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskRecord } from '@lookrun/shared';
import { BusyButton } from '@/components/busy-button';
import { notify } from '@/components/notify';
import { PageCard } from '@/components/page-card';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorText } from '@/utils/error-text';
import { reorderById } from '@/utils/sortable-items';
import { draggingItemStyle } from '@/utils/sortable-style';
import { api, type ModelBrief, type QueueDefWithItems } from './api';
import {
    createQueueThenSaveItems,
    isNewQueueRoute,
    queueEditTitle,
    queueSaveItemsError,
    queueSaveNameError,
    validQueueItems,
} from './utils';

interface EditItem {
    id: string;
    taskId: number | undefined;
    modelId: string | undefined;
}

interface SortableTaskItemProps {
    item: EditItem;
    index: number;
    tasks: TaskRecord[];
    models: ModelBrief[];
    canDelete: boolean;
    onUpdate: (patch: Partial<EditItem>) => void;
    onDelete: () => void;
}

function SortableTaskItem({
    item,
    index,
    tasks,
    models,
    canDelete,
    onUpdate,
    onDelete,
}: SortableTaskItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    return (
        <div
            ref={setNodeRef}
            className='flex flex-wrap items-center gap-2'
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: draggingItemStyle(isDragging).opacity,
                position: 'relative',
                zIndex: draggingItemStyle(isDragging).zIndex,
            }}
        >
            <Button
                ref={setActivatorNodeRef}
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={`拖拽第 ${index + 1} 个任务进行排序`}
                title='拖拽排序'
                style={{ cursor: draggingItemStyle(isDragging).cursor, touchAction: 'none' }}
                {...attributes}
                {...listeners}
            >
                <GripVertical />
            </Button>
            <span className='text-muted-foreground'>{`${index + 1}.`}</span>
            <SelectField
                className='w-[200px]'
                placeholder='选择任务'
                value={item.taskId === undefined ? undefined : String(item.taskId)}
                onValueChange={(taskId) => onUpdate({ taskId: Number(taskId) })}
                options={tasks.map((task) => ({ label: task.name, value: String(task.id) }))}
            />
            <SelectField
                className='w-[180px]'
                placeholder='选择模型'
                value={item.modelId}
                onValueChange={(modelId) => onUpdate({ modelId })}
                options={models.map((model) => ({
                    label: model.name,
                    value: model.id,
                }))}
            />
            <Button
                size='icon-sm'
                variant='destructive'
                disabled={!canDelete}
                aria-label='删除任务项'
                onClick={onDelete}
            >
                <Trash2 />
            </Button>
        </div>
    );
}

export default function QueueEditPage() {
    const { id } = useParams();
    const isNew = isNewQueueRoute(id);
    const navigate = useNavigate();
    const nextItemId = useRef(0);

    const [name, setName] = useState('');
    const [items, setItems] = useState<EditItem[]>([]);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [models, setModels] = useState<ModelBrief[]>([]);
    const [saving, setSaving] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const createEditItem = (taskId: number | undefined, modelId: string | undefined): EditItem => ({
        id: `queue-item-${id ?? 'new'}-${nextItemId.current++}`,
        taskId,
        modelId,
    });

    useEffect(() => {
        api.listTasks()
            .then(setTasks)
            .catch(() => {});
        api.listModels()
            .then((r) => setModels(r.models))
            .catch(() => {});
        if (isNew) {
            setItems([createEditItem(undefined, undefined)]);
            return;
        }
        api.getQueue(Number(id))
            .then((q: QueueDefWithItems) => {
                setName(q.name);
                setItems(q.items.map((item) => createEditItem(item.taskId, item.modelId)));
            })
            .catch((e: Error) => notify.error(e.message));
    }, [id]);

    const persistQueue = async (payload: {
        name: string;
        items: { taskId: number; modelId: string }[];
    }) => {
        try {
            await writeQueue(payload);
            notify.success('已保存');
            navigate('/queues');
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setSaving(false);
        }
    };

    const writeQueue = async (payload: {
        name: string;
        items: { taskId: number; modelId: string }[];
    }) => {
        if (isNew) {
            await createThenUpdateQueue(payload);
            return;
        }
        await api.updateQueue(Number(id), payload);
    };

    const createThenUpdateQueue = async (payload: {
        name: string;
        items: { taskId: number; modelId: string }[];
    }) => {
        await createQueueThenSaveItems({
            payload,
            create: api.createQueue,
            update: api.updateQueue,
        });
    };

    const saveValidQueue = async () => {
        const validItems = validQueueItems(items);
        const itemsError = queueSaveItemsError(validItems.length);
        if (itemsError) {
            notify.warning(itemsError);
            return;
        }
        setSaving(true);
        await persistQueue({
            name: name.trim(),
            items: validItems.map((item) => ({
                taskId: item.taskId!,
                modelId: item.modelId!,
            })),
        });
    };

    const save = async () => {
        const nameError = queueSaveNameError(name);
        if (nameError) {
            notify.warning(nameError);
            return;
        }
        await saveValidQueue();
    };

    const updateItem = (index: number, patch: Partial<EditItem>) => {
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    return (
        <PageCard
            title={queueEditTitle(isNew)}
            extra={
                <div className='flex gap-2'>
                    <Button variant='outline' onClick={() => navigate('/queues')}>
                        返回
                    </Button>
                    <BusyButton busy={saving} onClick={() => void save()}>
                        保存
                    </BusyButton>
                </div>
            }
        >
            <div className='flex flex-col gap-4'>
                <div>
                    <div className='font-medium'>队列名</div>
                    <Input
                        className='mt-2'
                        placeholder='例如：每日冒烟测试'
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className='font-medium'>任务列表（按顺序串行执行）</div>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={({ active, over }) => {
                        if (!over) return;
                        setItems((currentItems) =>
                            reorderById(currentItems, String(active.id), String(over.id)),
                        );
                    }}
                >
                    <SortableContext
                        items={items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {items.map((item, index) => (
                            <SortableTaskItem
                                key={item.id}
                                item={item}
                                index={index}
                                tasks={tasks}
                                models={models}
                                canDelete={items.length > 1}
                                onUpdate={(patch) => updateItem(index, patch)}
                                onDelete={() =>
                                    setItems((currentItems) =>
                                        currentItems.filter(
                                            (currentItem) => currentItem.id !== item.id,
                                        ),
                                    )
                                }
                            />
                        ))}
                    </SortableContext>
                </DndContext>
                <Button
                    variant='outline'
                    className='border-dashed'
                    onClick={() =>
                        setItems((currentItems) => [
                            ...currentItems,
                            createEditItem(undefined, undefined),
                        ])
                    }
                >
                    <Plus />
                    添加任务
                </Button>
            </div>
        </PageCard>
    );
}
