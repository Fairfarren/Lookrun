import { yaml } from "@codemirror/lang-yaml";
import {
	DeleteOutlined,
	HolderOutlined,
	PlusOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CodeMirror from "@uiw/react-codemirror";
import {
	App as AntApp,
	Alert,
	AutoComplete,
	Button,
	Card,
	Flex,
	Input,
	InputNumber,
	Segmented,
	Select,
	Space,
	Typography,
} from "antd";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	ACTION_OPTIONS,
	actionOptionsForTarget,
	createStepId,
	formToYaml,
	yamlToForm,
	type FormScript,
	type FormStep,
	type FormTask,
} from "../../../shared/yaml-form";
import type {
	AndroidAppRecord,
	AndroidDeviceRecord,
} from "../../../shared/types";
import { api } from "../api";
import { createAndroidAppOptions } from "../android-app-options";
import { reorderById } from "../sortable-items";
import { useThemeMode } from "../theme-context";
import { createValidationErrorKey } from "../validation-errors";

const VALIDATE_DEBOUNCE_MS = 800;

function createEmptyStep(action = "aiTap"): FormStep {
	return {
		id: createStepId(),
		action,
		params:
			action === "aiScroll"
				? { direction: "down" }
				: action === "aiKeyboardPress"
					? { key: "Enter" }
					: {},
	};
}

function createEmptyTask(index: number): FormTask {
	return {
		id: createStepId(),
		name: `步骤组 ${index}`,
		steps: [createEmptyStep()],
	};
}

function createEmptyForm(): FormScript {
	return { target: { type: "web", url: "" }, tasks: [createEmptyTask(1)] };
}

interface SortableListProps {
	ids: string[];
	onReorder: (activeId: string, overId: string) => void;
	children: ReactNode;
}

function SortableList({ ids, onReorder, children }: SortableListProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={({ active, over }) => {
				if (over) onReorder(String(active.id), String(over.id));
			}}
		>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				{children}
			</SortableContext>
		</DndContext>
	);
}

interface SortableTaskCardProps {
	id: string;
	index: number;
	name: string;
	canDelete: boolean;
	onNameChange: (name: string) => void;
	onDelete: () => void;
	children: ReactNode;
}

function SortableTaskCard({
	id,
	index,
	name,
	canDelete,
	onNameChange,
	onDelete,
	children,
}: SortableTaskCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	return (
		<Card
			ref={setNodeRef}
			size="small"
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
				position: "relative",
				zIndex: isDragging ? 1 : undefined,
			}}
			title={
				<Space>
					<Button
						ref={setActivatorNodeRef}
						type="text"
						size="small"
						icon={<HolderOutlined />}
						aria-label={`拖拽第 ${index + 1} 个步骤组进行排序`}
						title="拖拽排序"
						style={{
							cursor: isDragging ? "grabbing" : "grab",
							touchAction: "none",
						}}
						{...attributes}
						{...listeners}
					/>
					<Typography.Text type="secondary">{`${index + 1}.`}</Typography.Text>
					<Input
						style={{ maxWidth: 320 }}
						placeholder="步骤组名称，如：登录"
						value={name}
						onChange={(event) => onNameChange(event.target.value)}
					/>
				</Space>
			}
			extra={
				<Button
					size="small"
					danger
					icon={<DeleteOutlined />}
					disabled={!canDelete}
					onClick={onDelete}
				/>
			}
		>
			{children}
		</Card>
	);
}

interface SortableStepRowProps {
	id: string;
	index: number;
	children: ReactNode;
}

function SortableStepRow({ id, index, children }: SortableStepRowProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	return (
		<Flex
			ref={setNodeRef}
			gap={8}
			align="center"
			wrap="wrap"
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
				position: "relative",
				zIndex: isDragging ? 1 : undefined,
			}}
		>
			<Button
				ref={setActivatorNodeRef}
				type="text"
				size="small"
				icon={<HolderOutlined />}
				aria-label={`拖拽第 ${index + 1} 个步骤进行排序`}
				title="拖拽排序"
				style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
				{...attributes}
				{...listeners}
			/>
			<Typography.Text type="secondary" style={{ width: 24 }}>
				{index + 1}.
			</Typography.Text>
			{children}
		</Flex>
	);
}

export default function TaskEditPage() {
	const themeMode = useThemeMode();
	const { id } = useParams();
	const isNew = id === undefined || id === "new";
	const { message } = AntApp.useApp();
	const navigate = useNavigate();

	const [mode, setMode] = useState<"form" | "yaml">("form");
	const [name, setName] = useState("");
	const [form, setForm] = useState<FormScript>(createEmptyForm);
	const [yamlText, setYamlText] = useState("");
	// 从 YAML 高级模式加载的脚本无法转回表单时，锁定在 YAML 模式并提示
	const [yamlLocked, setYamlLocked] = useState(false);
	const [errors, setErrors] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [loaded, setLoaded] = useState(isNew);
	const [androidDevices, setAndroidDevices] = useState<AndroidDeviceRecord[]>([]);
	const [androidApps, setAndroidApps] = useState<AndroidAppRecord[]>([]);
	const [loadingDevices, setLoadingDevices] = useState(false);
	const [loadingApps, setLoadingApps] = useState(false);
	const [checkingDevice, setCheckingDevice] = useState(false);
	const androidAppsRequestId = useRef(0);
	const validateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const androidDeviceId =
		form.target.type === "android" ? form.target.deviceId : "";

	useEffect(() => {
		if (!isNew) {
			api
				.getTask(Number(id))
				.then((task) => {
					setName(task.name);
					setYamlText(task.yaml);
					const parsed = yamlToForm(task.yaml);
					if (parsed.ok) {
						setForm(parsed.form);
					} else {
						setMode("yaml");
						setYamlLocked(true);
					}
					setLoaded(true);
				})
				.catch((error: Error) => message.error(error.message));
		}
	}, [id]);

	const loadAndroidDevices = async () => {
		setLoadingDevices(true);
		try {
			const result = await api.listAndroidDevices();
			setAndroidDevices(result.devices);
			setForm((prev) => {
				if (prev.target.type !== "android" || prev.target.deviceId) {
					return prev;
				}
				return {
					...prev,
					target: {
						type: "android",
						deviceId: result.devices[0]?.id ?? "",
					},
				};
			});
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setLoadingDevices(false);
		}
	};

	useEffect(() => {
		if (form.target.type === "android") {
			void loadAndroidDevices();
		}
	}, [form.target.type]);

	const loadAndroidApps = async (deviceId: string) => {
		const requestId = androidAppsRequestId.current + 1;
		androidAppsRequestId.current = requestId;
		setAndroidApps([]);
		setLoadingApps(true);
		try {
			const result = await api.listAndroidApps(deviceId);
			if (requestId === androidAppsRequestId.current) {
				setAndroidApps(result.apps);
			}
		} catch (error) {
			if (requestId === androidAppsRequestId.current) {
				setAndroidApps([]);
				message.error(error instanceof Error ? error.message : String(error));
			}
		} finally {
			if (requestId === androidAppsRequestId.current) {
				setLoadingApps(false);
			}
		}
	};

	useEffect(() => {
		if (!androidDeviceId) {
			androidAppsRequestId.current += 1;
			setAndroidApps([]);
			setLoadingApps(false);
			return;
		}
		void loadAndroidApps(androidDeviceId);
	}, [androidDeviceId]);

	// 当前编辑内容对应的 YAML 文本
	const currentYaml = mode === "form" ? formToYaml(form) : yamlText;

	// 编辑停顿后自动调后端校验（含变量检查）
	useEffect(() => {
		if (!loaded) {
			return;
		}
		clearTimeout(validateTimer.current);
		validateTimer.current = setTimeout(() => {
			api
				.validateYaml(currentYaml)
				.then((result) => setErrors(result.errors))
				.catch(() => setErrors([]));
		}, VALIDATE_DEBOUNCE_MS);
		return () => clearTimeout(validateTimer.current);
	}, [currentYaml, loaded]);

	const switchMode = (next: string | number) => {
		if (next === mode) {
			return;
		}
		if (next === "yaml") {
			setYamlText(formToYaml(form));
			setMode("yaml");
			return;
		}
		const parsed = yamlToForm(yamlText);
		if (parsed.ok) {
			setForm(parsed.form);
			setMode("form");
			setYamlLocked(false);
		} else {
			message.warning(
				"当前 YAML 包含表单不支持的内容，无法切换；请先在 YAML 里修正",
			);
		}
	};

	const updateTask = (index: number, patch: Partial<FormTask>) => {
		setForm((prev) => ({
			...prev,
			tasks: prev.tasks.map((task, i) =>
				i === index ? { ...task, ...patch } : task,
			),
		}));
	};

	const updateStep = (
		taskIndex: number,
		stepIndex: number,
		patch: Partial<FormStep>,
	) => {
		const task = form.tasks[taskIndex];
		updateTask(taskIndex, {
			steps: task.steps.map((step, i) =>
				i === stepIndex ? { ...step, ...patch } : step,
			),
		});
	};

	const save = async () => {
		if (!name.trim()) {
			message.warning("请填写任务名");
			return;
		}
		setSaving(true);
		try {
			const result = await api.validateYaml(currentYaml);
			if (!result.ok) {
				setErrors(result.errors);
				message.error("脚本校验未通过，请先修复错误");
				return;
			}
			const yamlToSave = currentYaml;
			if (isNew) {
				await api.createTask({ name: name.trim(), yaml: yamlToSave });
			} else {
				await api.updateTask(Number(id), {
					name: name.trim(),
					yaml: yamlToSave,
				});
			}
			message.success("已保存");
			navigate("/tasks");
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	};

	const renderStepFields = (
		taskIndex: number,
		stepIndex: number,
		step: FormStep,
	) => {
		const option = ACTION_OPTIONS.find((item) => item.action === step.action);
		if (!option) {
			return null;
		}
		return option.fields.map((field) => {
			const value = step.params[field.key];
			const onChange = (next: string | number | undefined) =>
				updateStep(taskIndex, stepIndex, {
					params: { ...step.params, [field.key]: next },
				});
			if (field.type === "select") {
				return (
					<Select
						key={field.key}
						style={{ width: 110 }}
						value={typeof value === "string" ? value : undefined}
						options={field.options}
						onChange={onChange}
					/>
				);
			}
			if (
				step.action === "launch" &&
				field.key === "target" &&
				form.target.type === "android"
			) {
				return (
					<Flex key={field.key} gap={8} style={{ flex: 1, minWidth: 280 }}>
						<AutoComplete
							style={{ flex: 1 }}
							value={typeof value === "string" ? value : ""}
							options={createAndroidAppOptions(androidApps)}
							placeholder={field.placeholder ?? field.label}
							notFoundContent={
								loadingApps
									? "正在读取应用列表…"
									: "没有匹配包名，可直接输入应用名称或包名"
							}
							filterOption={(inputValue, currentOption) =>
								String(currentOption?.value ?? "")
									.toLocaleLowerCase()
									.includes(inputValue.toLocaleLowerCase())
							}
							onChange={onChange}
						/>
						<Button
							icon={<ReloadOutlined />}
							loading={loadingApps}
							disabled={!androidDeviceId}
							title="刷新应用列表"
							onClick={() => void loadAndroidApps(androidDeviceId)}
						/>
					</Flex>
				);
			}
			if (field.type === "number") {
				return (
					<InputNumber
						key={field.key}
						style={{ width: 130 }}
						min={1}
						placeholder={field.placeholder ?? field.label}
						value={typeof value === "number" ? value : undefined}
						onChange={(next) => onChange(next ?? undefined)}
					/>
				);
			}
			return (
				<Input
					key={field.key}
					style={{ flex: 1, minWidth: 140 }}
					placeholder={field.placeholder ?? field.label}
					value={typeof value === "string" ? value : ""}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		});
	};

	const checkSelectedAndroidDevice = async () => {
		if (form.target.type !== "android" || !form.target.deviceId) {
			return;
		}
		setCheckingDevice(true);
		try {
			const result = await api.checkAndroidDevice(form.target.deviceId);
			if (result.ok) {
				message.success(`设备 ${result.device.name} 连接正常`);
			} else {
				message.error(result.message);
			}
		} catch (error) {
			message.error(error instanceof Error ? error.message : String(error));
		} finally {
			setCheckingDevice(false);
		}
	};

	const renderFormEditor = () => (
		<Space orientation="vertical" size="middle" style={{ width: "100%" }}>
			<Flex gap={12} wrap="wrap" align="center">
				<Typography.Text strong>运行目标</Typography.Text>
				<Segmented
					value={form.target.type}
					options={[
						{ label: "网页", value: "web" },
						{ label: "Android", value: "android" },
					]}
					onChange={(value) => {
						const targetType = value === "android" ? "android" : "web";
						setForm((prev) => ({
							...prev,
							target:
								targetType === "android"
									? { type: "android", deviceId: "" }
									: { type: "web", url: "" },
							tasks: prev.tasks.map((task) => ({
								...task,
								steps: task.steps.map((step) =>
									actionOptionsForTarget(targetType).some(
										(option) => option.action === step.action,
									)
										? step
										: createEmptyStep(),
								),
							})),
						}));
					}}
				/>
			</Flex>

			{form.target.type === "web" ? (
				<Flex gap={12} wrap="wrap" align="center">
				<Typography.Text strong>URL</Typography.Text>
				<Input
					style={{ flex: 1, minWidth: 260 }}
					placeholder="被测页面地址，如 https://example.com"
					value={form.target.url}
					onChange={(e) =>
						setForm((prev) => ({
							...prev,
							target:
								prev.target.type === "web"
									? { ...prev.target, url: e.target.value }
									: prev.target,
						}))
					}
				/>
				<InputNumber
					placeholder="视口宽(默认390)"
					min={320}
					value={form.target.viewportWidth}
					onChange={(value) =>
						setForm((prev) => ({
							...prev,
							target:
								prev.target.type === "web"
									? { ...prev.target, viewportWidth: value ?? undefined }
									: prev.target,
						}))
					}
				/>
				<InputNumber
					placeholder="视口高(默认844)"
					min={320}
					value={form.target.viewportHeight}
					onChange={(value) =>
						setForm((prev) => ({
							...prev,
							target:
								prev.target.type === "web"
									? { ...prev.target, viewportHeight: value ?? undefined }
									: prev.target,
						}))
					}
				/>
				</Flex>
			) : (
				<Flex gap={12} wrap="wrap" align="center">
					<Typography.Text strong>设备号</Typography.Text>
					<Select
						style={{ flex: 1, minWidth: 320 }}
						loading={loadingDevices}
						placeholder="选择已连接并授权的 Android 设备"
						value={form.target.deviceId || undefined}
						options={androidDevices.map((device) => ({
							label: `${device.name}（${device.id}）`,
							value: device.id,
						}))}
						onChange={(deviceId) =>
							setForm((prev) => ({
								...prev,
								target: { type: "android", deviceId },
							}))
						}
					/>
					<Button
						icon={<ReloadOutlined />}
						loading={loadingDevices}
						onClick={() => void loadAndroidDevices()}
					>
						刷新设备
					</Button>
					<Button
						loading={checkingDevice}
						disabled={!form.target.deviceId}
						onClick={() => void checkSelectedAndroidDevice()}
					>
						检查连接
					</Button>
				</Flex>
			)}

			<SortableList
				ids={form.tasks.map((task) => task.id)}
				onReorder={(activeId, overId) =>
					setForm((prev) => ({
						...prev,
						tasks: reorderById(prev.tasks, activeId, overId),
					}))
				}
			>
				{form.tasks.map((task, taskIndex) => (
					<SortableTaskCard
						key={task.id}
						id={task.id}
						index={taskIndex}
						name={task.name}
						canDelete={form.tasks.length > 1}
						onNameChange={(taskName) =>
							updateTask(taskIndex, { name: taskName })
						}
						onDelete={() =>
							setForm((prev) => ({
								...prev,
								tasks: prev.tasks.filter((currentTask) => currentTask.id !== task.id),
							}))
						}
					>
						<Flex vertical gap={8}>
							<SortableList
								ids={task.steps.map((step) => step.id)}
								onReorder={(activeId, overId) =>
									updateTask(taskIndex, {
										steps: reorderById(task.steps, activeId, overId),
									})
								}
							>
								{task.steps.map((step, stepIndex) => (
									<SortableStepRow
										key={step.id}
										id={step.id}
										index={stepIndex}
									>
										<Select
											style={{ width: 110 }}
											value={step.action}
											options={actionOptionsForTarget(form.target.type).map((option) => ({
												label: option.label,
												value: option.action,
											}))}
											onChange={(action) =>
												updateStep(taskIndex, stepIndex, createEmptyStep(action))
											}
										/>
										{renderStepFields(taskIndex, stepIndex, step)}
										<Input
											style={{ width: 110 }}
											placeholder="步骤名(可选)"
											value={step.name ?? ""}
											onChange={(e) =>
												updateStep(taskIndex, stepIndex, {
													name: e.target.value,
												})
											}
										/>
										<Button
											size="small"
											danger
											icon={<DeleteOutlined />}
											disabled={task.steps.length === 1}
											onClick={() =>
												updateTask(taskIndex, {
													steps: task.steps.filter((_, i) => i !== stepIndex),
												})
											}
										/>
									</SortableStepRow>
								))}
							</SortableList>
							<Button
								type="dashed"
								icon={<PlusOutlined />}
								onClick={() =>
									updateTask(taskIndex, {
										steps: [...task.steps, createEmptyStep()],
									})
								}
							>
								添加步骤
							</Button>
						</Flex>
					</SortableTaskCard>
				))}
			</SortableList>

			<Button
				type="dashed"
				block
				icon={<PlusOutlined />}
				onClick={() =>
					setForm((prev) => ({
						...prev,
						tasks: [...prev.tasks, createEmptyTask(prev.tasks.length + 1)],
					}))
				}
			>
				添加步骤组
			</Button>
		</Space>
	);

	const renderYamlEditor = () => (
		<>
			{yamlLocked && (
				<Alert
					type="warning"
					title="此脚本包含表单编辑器不支持的内容（如高级参数），已用 YAML 模式编辑"
					style={{ marginBottom: 12 }}
				/>
			)}
			<Typography.Paragraph type="secondary">
				支持动作：ai / aiTap / aiHover / aiRightClick / aiInput / aiAssert /
				aiWaitFor / aiQuery / aiKeyboardPress / aiScroll / sleep；变量用{" "}
				{"{{变量名}}"} 引用，在「设置-变量」中配置。
			</Typography.Paragraph>
			<CodeMirror
				value={yamlText}
				height="420px"
				theme={themeMode}
				extensions={[yaml()]}
				onChange={setYamlText}
				basicSetup={{ lineNumbers: true, foldGutter: true }}
			/>
		</>
	);

	return (
		<Card
			title={isNew ? "新建任务" : "编辑任务"}
			extra={
				<Space>
					<Segmented
						value={mode}
						onChange={switchMode}
						options={[
							{ label: "表单编辑", value: "form" },
							{ label: "YAML 编辑", value: "yaml" },
						]}
					/>
					<Button onClick={() => navigate("/tasks")}>返回</Button>
					<Button type="primary" loading={saving} onClick={save}>
						保存
					</Button>
				</Space>
			}
		>
			<Space orientation="vertical" size="middle" style={{ width: "100%" }}>
				<div>
					<Typography.Text strong>任务名</Typography.Text>
					<Input
						style={{ marginTop: 8 }}
						placeholder="例如：登录冒烟测试"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
				{mode === "form" ? renderFormEditor() : renderYamlEditor()}
				{errors.length > 0 && (
					<Alert
						type="error"
						title="脚本存在问题"
						description={
							<ul style={{ margin: 0, paddingInlineStart: 20 }}>
								{errors.map((error, errorIndex) => (
									<li key={createValidationErrorKey(error, errorIndex)}>
										{error}
									</li>
								))}
							</ul>
						}
					/>
				)}
				{errors.length === 0 && loaded && (
					<Alert type="success" title="校验通过" showIcon />
				)}
			</Space>
		</Card>
	);
}
