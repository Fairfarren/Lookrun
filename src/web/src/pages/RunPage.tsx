import {
	ArrowDownOutlined,
	ArrowUpOutlined,
	DeleteOutlined,
	PlusOutlined,
	StopOutlined,
} from "@ant-design/icons";
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
	Typography,
} from "antd";
import { useEffect, useRef, useState } from "react";
import type { RunStepRecord, TaskRecord } from "../../../shared/types";
import { api, type CurrentRunState, type ModelBrief, type QueueItem } from "../api";
import { RunStatusTag, formatDuration } from "../components";
import { useWebSocket, type WsMessage } from "../hooks";

interface LiveStep {
	stepIndex: number;
	stepName: string;
	action: string;
	status: "running" | "success" | "failed";
	record?: RunStepRecord;
}

export default function RunPage() {
	const { message } = AntApp.useApp();
	const [current, setCurrent] = useState<CurrentRunState>({
		status: "idle",
		run: null,
	});
	const [frame, setFrame] = useState<string | null>(null);
	const [steps, setSteps] = useState<LiveStep[]>([]);
	const [finishedStatus, setFinishedStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const stepListRef = useRef<HTMLDivElement>(null);

	// 任务队列
	const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
	const [tasks, setTasks] = useState<TaskRecord[]>([]);
	const [models, setModels] = useState<ModelBrief[]>([]);
	const [addTaskId, setAddTaskId] = useState<number>();
	const [addModelId, setAddModelId] = useState<string>();

	useEffect(() => {
		api
			.currentRun()
			.then(setCurrent)
			.catch((error: Error) => message.error(error.message))
			.finally(() => setLoading(false));
		api.listQueue().then((r) => setQueueItems(r.items)).catch(() => {});
		api.listTasks().then(setTasks).catch(() => {});
		api
			.listModels()
			.then((r) => {
				setModels(r.models);
				setAddModelId(r.selected ?? r.models[0]?.id);
			})
			.catch(() => {});
	}, []);

	const handleMessage = (msg: WsMessage) => {
		if (msg.type === "frame") {
			setFrame(msg.data);
			return;
		}
		if (msg.type === "queue") {
			setQueueItems(msg.items);
			return;
		}
		if (msg.type === "step-start") {
			setSteps((prev) => [
				...prev,
				{
					stepIndex: msg.stepIndex,
					stepName: msg.stepName,
					action: msg.action,
					status: "running",
				},
			]);
			setCurrent((prev) =>
				prev.run
					? {
							status: "running",
							run: {
								...prev.run,
								currentStepIndex: msg.stepIndex,
								totalSteps: msg.totalSteps,
							},
						}
					: prev,
			);
			return;
		}
		if (msg.type === "step") {
			setSteps((prev) =>
				prev.map((item) =>
					item.stepIndex === msg.step.stepIndex
						? { ...item, status: msg.step.status, record: msg.step }
						: item,
				),
			);
			return;
		}
		if (msg.type === "run") {
			if (msg.run.status === "running") {
				setCurrent({
					status: "running",
					run: {
						runId: msg.run.id,
						taskName: msg.run.taskName,
						model: msg.run.model,
						startedAt: msg.run.startedAt,
						currentStepIndex: -1,
						totalSteps: 0,
					},
				});
				setSteps([]);
				setFinishedStatus(null);
			} else {
				setCurrent({ status: "idle", run: null });
				setFinishedStatus(msg.run.status);
			}
		}
	};

	useWebSocket(handleMessage);

	useEffect(() => {
		stepListRef.current?.scrollTo({
			top: stepListRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [steps.length]);

	const stop = async () => {
		try {
			await api.stopRun();
			message.info("已发送停止指令");
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		}
	};

	const addToQueue = async () => {
		if (!addTaskId || !addModelId) {
			message.warning("请选择任务和模型");
			return;
		}
		try {
			const result = await api.startRun({ taskId: addTaskId, modelId: addModelId });
			if (result.queued) {
				message.success("已加入队列");
			} else {
				message.success("已开始运行");
			}
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		}
	};

	const moveItem = async (id: number, direction: "up" | "down") => {
		try {
			const result = await api.moveQueueItem(id, direction);
			setQueueItems(result.items);
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		}
	};

	const cancelItem = async (id: number) => {
		try {
			const result = await api.cancelQueueItem(id);
			setQueueItems(result.items);
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		}
	};

	if (loading) {
		return <Spin style={{ display: "block", margin: "80px auto" }} />;
	}

	const running = current.status === "running";
	const frameAreaHeight = "calc(100vh - 250px)";
	const pendingItems = queueItems.filter((item) => item.status === "pending");

	return (
		<Row gutter={16}>
			<Col span={10}>
				<Card
					title="实时画面"
					extra={
						running ? (
							<Button danger icon={<StopOutlined />} onClick={stop}>
								停止运行
							</Button>
						) : undefined
					}
				>
					{running || frame ? (
						<div
							style={{
								background: "#000",
								borderRadius: 8,
								overflow: "hidden",
								height: frameAreaHeight,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{frame ? (
								<img
									src={`data:image/jpeg;base64,${frame}`}
									style={{
										maxWidth: "100%",
										maxHeight: "100%",
										objectFit: "contain",
										display: "block",
									}}
									alt="实时画面"
								/>
							) : (
								<div style={{ color: "#fff" }}>等待浏览器画面...</div>
							)}
						</div>
					) : (
						<Empty description="当前没有运行中的任务，到「任务」页面发起一次运行" />
					)}
					{finishedStatus && !running && (
						<div style={{ marginTop: 12 }}>
							上次运行结果：
							<RunStatusTag status={finishedStatus as never} />
						</div>
					)}
				</Card>
			</Col>
			<Col span={14}>
				<Space orientation="vertical" size={16} style={{ width: "100%" }}>
					<Card
						title={`任务队列${pendingItems.length > 0 ? `（${pendingItems.length} 个待执行）` : ""}`}
						size="small"
					>
						<div style={{ maxHeight: 180, overflowY: "auto" }}>
							{pendingItems.length === 0 && (
								<Typography.Text type="secondary">队列为空</Typography.Text>
							)}
							<Flex vertical>
								{pendingItems.map((item, index) => (
									<div
										key={item.id}
										style={{
											padding: "6px 0",
											borderBottom: "1px solid #f0f0f0",
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
										}}
									>
										<Space>
											<Tag>{`#${index + 1}`}</Tag>
											<Typography.Text strong>{item.taskName}</Typography.Text>
											<Typography.Text type="secondary" style={{ fontSize: 12 }}>
												{item.model}
											</Typography.Text>
										</Space>
										<Space size={4}>
											<Button
												size="small"
												type="text"
												icon={<ArrowUpOutlined />}
												disabled={index === 0}
												onClick={() => moveItem(item.id, "up")}
											/>
											<Button
												size="small"
												type="text"
												icon={<ArrowDownOutlined />}
												disabled={index === pendingItems.length - 1}
												onClick={() => moveItem(item.id, "down")}
											/>
											<Button
												size="small"
												type="text"
												danger
												icon={<DeleteOutlined />}
												onClick={() => cancelItem(item.id)}
											/>
										</Space>
									</div>
								))}
							</Flex>
						</div>
						<div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 8, marginTop: 8 }}>
							<Space style={{ width: "100%" }}>
								<Select
									style={{ flex: 1, minWidth: 160 }}
									placeholder="选择任务"
									value={addTaskId}
									onChange={setAddTaskId}
									options={tasks.map((task) => ({
										label: task.name,
										value: task.id,
									}))}
								/>
								<Select
									style={{ minWidth: 160 }}
									placeholder="选择模型"
									value={addModelId}
									onChange={setAddModelId}
									options={models.map((model) => ({
										label: model.name,
										value: model.id,
									}))}
								/>
								<Button type="primary" icon={<PlusOutlined />} onClick={addToQueue}>
									添加
								</Button>
							</Space>
						</div>
					</Card>

					<Card
						title={
							<Space>
								步骤日志
								{current.run && (
									<Typography.Text type="secondary">
										{current.run.taskName}（{current.run.currentStepIndex + 1}/
										{current.run.totalSteps || "?"}）
									</Typography.Text>
								)}
							</Space>
						}
					>
						<div
							ref={stepListRef}
							style={{ maxHeight: "calc(100vh - 510px)", overflowY: "auto" }}
						>
							{steps.length === 0 && (
								<Typography.Text type="secondary">
									{running ? "准备中..." : "暂无步骤"}
								</Typography.Text>
							)}
							<Flex vertical>
								{steps.map((item) => (
									<div
										key={item.stepIndex}
										style={{
											padding: "10px 0",
											borderBottom: "1px solid #f0f0f0",
										}}
									>
										<Space
											orientation="vertical"
											size={2}
											style={{ width: "100%" }}
										>
											<Space wrap>
												<Tag>{`#${item.stepIndex + 1}`}</Tag>
												<Typography.Text strong>{item.stepName}</Typography.Text>
												<Tag color="blue">{item.action}</Tag>
												{item.status === "running" && (
													<Tag color="processing">执行中</Tag>
												)}
												{item.status === "success" && (
													<Tag color="success">成功</Tag>
												)}
												{item.status === "failed" && (
													<Tag color="error">失败</Tag>
												)}
												{item.record && (
													<Typography.Text type="secondary">
														{formatDuration(item.record.durationMs)}
													</Typography.Text>
												)}
											</Space>
											{item.record?.error && (
												<Typography.Text type="danger">
													{item.record.error}
												</Typography.Text>
											)}
											{item.record?.url && (
												<Typography.Text
													type="secondary"
													style={{ fontSize: 12 }}
												>
													{item.record.url}
												</Typography.Text>
											)}
										</Space>
									</div>
								))}
							</Flex>
						</div>
					</Card>
				</Space>
			</Col>
		</Row>
	);
}