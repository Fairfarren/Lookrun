import {
	ArrowDownOutlined,
	ArrowUpOutlined,
	DeleteOutlined,
	PlusOutlined,
} from "@ant-design/icons";
import {
	App as AntApp,
	Button,
	Card,
	Input,
	Select,
	Space,
	Typography,
} from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { TaskRecord } from "../../../shared/types";
import { api, type ModelBrief, type QueueDefWithItems } from "../api";

interface EditItem {
	taskId: number | undefined;
	modelId: string | undefined;
}

function moveItem(list: EditItem[], index: number, offset: -1 | 1): EditItem[] {
	const target = index + offset;
	if (target < 0 || target >= list.length) return list;
	const next = [...list];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

export default function QueueEditPage() {
	const { id } = useParams();
	const isNew = id === undefined || id === "new";
	const { message } = AntApp.useApp();
	const navigate = useNavigate();

	const [name, setName] = useState("");
	const [items, setItems] = useState<EditItem[]>([]);
	const [tasks, setTasks] = useState<TaskRecord[]>([]);
	const [models, setModels] = useState<ModelBrief[]>([]);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		api
			.listTasks()
			.then(setTasks)
			.catch(() => {});
		api
			.listModels()
			.then((r) => setModels(r.models))
			.catch(() => {});
		if (!isNew) {
			api
				.getQueue(Number(id))
				.then((q: QueueDefWithItems) => {
					setName(q.name);
					setItems(
						q.items.map((item) => ({
							taskId: item.taskId,
							modelId: item.modelId,
						})),
					);
				})
				.catch((e: Error) => message.error(e.message));
		} else {
			setItems([{ taskId: undefined, modelId: undefined }]);
		}
	}, [id]);

	const save = async () => {
		if (!name.trim()) {
			message.warning("请填写队列名");
			return;
		}
		const validItems = items.filter((item) => item.taskId && item.modelId);
		if (validItems.length === 0) {
			message.warning("至少添加一个任务");
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
			message.success("已保存");
			navigate("/queues");
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	};

	const updateItem = (index: number, patch: Partial<EditItem>) => {
		setItems((prev) =>
			prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
		);
	};

	return (
		<Card
			title={isNew ? "新建队列" : "编辑队列"}
			extra={
				<Space>
					<Button onClick={() => navigate("/queues")}>返回</Button>
					<Button type="primary" loading={saving} onClick={save}>
						保存
					</Button>
				</Space>
			}
		>
			<Space direction="vertical" size="middle" style={{ width: "100%" }}>
				<div>
					<Typography.Text strong>队列名</Typography.Text>
					<Input
						style={{ marginTop: 8 }}
						placeholder="例如：每日冒烟测试"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				<div>
					<Typography.Text strong>任务列表（按顺序串行执行）</Typography.Text>
				</div>
				{items.map((item, index) => (
					<Space key={index} wrap>
						<Typography.Text type="secondary">{`${index + 1}.`}</Typography.Text>
						<Select
							style={{ width: 200 }}
							placeholder="选择任务"
							value={item.taskId}
							onChange={(v) => updateItem(index, { taskId: v })}
							options={tasks.map((t) => ({ label: t.name, value: t.id }))}
						/>
						<Select
							style={{ width: 180 }}
							placeholder="选择模型"
							value={item.modelId}
							onChange={(v) => updateItem(index, { modelId: v })}
							options={models.map((m) => ({ label: m.name, value: m.id }))}
						/>
						<Button
							size="small"
							icon={<ArrowUpOutlined />}
							disabled={index === 0}
							onClick={() => setItems(moveItem(items, index, -1))}
						/>
						<Button
							size="small"
							icon={<ArrowDownOutlined />}
							disabled={index === items.length - 1}
							onClick={() => setItems(moveItem(items, index, 1))}
						/>
						<Button
							size="small"
							danger
							icon={<DeleteOutlined />}
							disabled={items.length === 1}
							onClick={() => setItems(items.filter((_, i) => i !== index))}
						/>
					</Space>
				))}
				<Button
					type="dashed"
					icon={<PlusOutlined />}
					onClick={() =>
						setItems([...items, { taskId: undefined, modelId: undefined }])
					}
				>
					添加任务
				</Button>
			</Space>
		</Card>
	);
}
