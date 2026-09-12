import { DeleteOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
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
import { App as AntApp, Button, Card, Input, Select, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TaskRecord } from '@lookrun/shared';
import { api, type ModelBrief, type QueueDefWithItems } from '../api';
import { reorderById } from '../utils/sortable-items';
import { errorText } from '../utils/error-text';
import { draggingItemStyle } from '../utils/sortable-style';
import {
    createQueueThenSaveItems,
    isNewQueueRoute,
    queueEditTitle,
    queueSaveItemsError,
    queueSaveNameError,
    validQueueItems,
} from '../utils/queue-edit';

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
        <Space
            ref={setNodeRef}
            wrap
            style={{
                width: '100%',
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: draggingItemStyle(isDragging).opacity,
                position: 'relative',
                zIndex: draggingItemStyle(isDragging).zIndex,
            }}
        >
            <Button
                ref={setActivatorNodeRef}
                type='text'
                size='small'
                icon={<HolderOutlined />}
                aria-label={`拖拽第 ${index + 1} 个任务进行排序`}
                title='拖拽排序'
                style={{ cursor: draggingItemStyle(isDragging).cursor, touchAction: 'none' }}
                {...attributes}
                {...listeners}
            />
            <Typography.Text type='secondary'>{`${index + 1}.`}</Typography.Text>
            <Select
                style={{ width: 200 }}
                placeholder='选择任务'
                value={item.taskId}
                onChange={(taskId) => onUpdate({ taskId })}
                options={tasks.map((task) => ({ label: task.name, value: task.id }))}
            />
            <Select
                style={{ width: 180 }}
                placeholder='选择模型'
                value={item.modelId}
                onChange={(modelId) => onUpdate({ modelId })}
                options={models.map((model) => ({
                    label: model.name,
                    value: model.id,
                }))}
            />
            <Button
                size='small'
                danger
                icon={<DeleteOutlined />}
                disabled={!canDelete}
                onClick={onDelete}
            />
        </Space>
    );
}

export default function QueueEditPage() {
    const { id } = useParams();
    const isNew = isNewQueueRoute(id);
    const { message } = AntApp.useApp();
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
            .catch((e: Error) => message.error(e.message));
    }, [id]);

    const persistQueue = async (payload: {
        name: string;
        items: { taskId: number; modelId: string }[];
    }) => {
        try {
            await writeQueue(payload);
            message.success('已保存');
            navigate('/queues');
        } catch (error) {
            message.error(errorText(error));
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
            message.warning(itemsError);
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
            message.warning(nameError);
            return;
        }
        await saveValidQueue();
    };

    const updateItem = (index: number, patch: Partial<EditItem>) => {
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    return (
        <Card
            title={queueEditTitle(isNew)}
            extra={
                <Space>
                    <Button onClick={() => navigate('/queues')}>返回</Button>
                    <Button type='primary' loading={saving} onClick={save}>
                        保存
                    </Button>
                </Space>
            }
        >
            <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
                <div>
                    <Typography.Text strong>队列名</Typography.Text>
                    <Input
                        style={{ marginTop: 8 }}
                        placeholder='例如：每日冒烟测试'
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <Typography.Text strong>任务列表（按顺序串行执行）</Typography.Text>
                </div>
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
                    type='dashed'
                    icon={<PlusOutlined />}
                    onClick={() =>
                        setItems((currentItems) => [
                            ...currentItems,
                            createEditItem(undefined, undefined),
                        ])
                    }
                >
                    添加任务
                </Button>
            </Space>
        </Card>
    );
}
