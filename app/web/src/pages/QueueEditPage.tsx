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
                opacity: isDragging ? 0.5 : 1,
                position: 'relative',
                zIndex: isDragging ? 1 : undefined,
            }}
        >
            <Button
                ref={setActivatorNodeRef}
                type='text'
                size='small'
                icon={<HolderOutlined />}
                aria-label={`拖拽第 ${index + 1} 个任务进行排序`}
                title='拖拽排序'
                style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
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
    const isNew = id === undefined || id === 'new';
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
        if (!isNew) {
            api.getQueue(Number(id))
                .then((q: QueueDefWithItems) => {
                    setName(q.name);
                    setItems(q.items.map((item) => createEditItem(item.taskId, item.modelId)));
                })
                .catch((e: Error) => message.error(e.message));
        } else {
            setItems([createEditItem(undefined, undefined)]);
        }
    }, [id]);

    const save = async () => {
        if (!name.trim()) {
            message.warning('请填写队列名');
            return;
        }
        const validItems = items.filter((item) => item.taskId && item.modelId);
        if (validItems.length === 0) {
            message.warning('至少添加一个任务');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                items: validItems.map((item) => ({
                    taskId: item.taskId!,
                    modelId: item.modelId!,
                })),
            };
            if (isNew) {
                await api.createQueue(payload.name);
                // 创建后更新条目
                const created = await api.listQueues();
                const q = created.items[0];
                if (q) await api.updateQueue(q.id, payload);
            } else {
                await api.updateQueue(Number(id), payload);
            }
            message.success('已保存');
            navigate('/queues');
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    const updateItem = (index: number, patch: Partial<EditItem>) => {
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    return (
        <Card
            title={isNew ? '新建队列' : '编辑队列'}
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
