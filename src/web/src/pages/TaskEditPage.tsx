import { yaml } from "@codemirror/lang-yaml";
import { DeleteOutlined, HolderOutlined, PlusOutlined } from "@ant-design/icons";
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
	createStepId,
	formToYaml,
	yamlToForm,
	type FormScript,
	type FormStep,
	type FormTask,
} from "../../../shared/yaml-form";
import { api } from "../api";
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
	return { target: "", tasks: [createEmptyTask(1)] };
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
	const validateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

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

	const renderFormEditor = () => (
		<Space orientation="vertical" size="middle" style={{ width: "100%" }}>
			<Flex gap={12} wrap="wrap" align="center">
				<Typography.Text strong>URL</Typography.Text>
				<Input
					style={{ flex: 1, minWidth: 260 }}
					placeholder="被测页面地址，如 https://example.com"
					value={form.target}
					onChange={(e) =>
						setForm((prev) => ({ ...prev, target: e.target.value }))
					}
				/>
				<InputNumber
					placeholder="视口宽(默认390)"
					min={320}
					value={form.viewportWidth}
					onChange={(value) =>
						setForm((prev) => ({ ...prev, viewportWidth: value ?? undefined }))
					}
				/>
				<InputNumber
					placeholder="视口高(默认844)"
					min={320}
					value={form.viewportHeight}
					onChange={(value) =>
						setForm((prev) => ({ ...prev, viewportHeight: value ?? undefined }))
					}
				/>
			</Flex>

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
											options={ACTION_OPTIONS.map((option) => ({
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
