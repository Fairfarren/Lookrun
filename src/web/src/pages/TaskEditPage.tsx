import { yaml } from "@codemirror/lang-yaml";
import {
	ArrowDownOutlined,
	ArrowUpOutlined,
	DeleteOutlined,
	PlusOutlined,
} from "@ant-design/icons";
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
import { useEffect, useRef, useState } from "react";
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
import { useThemeMode } from "../theme-context";

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

// 上移/下移数组元素，返回新数组
function moveItem<T>(list: T[], index: number, offset: -1 | 1): T[] {
	const target = index + offset;
	if (target < 0 || target >= list.length) {
		return list;
	}
	const next = [...list];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
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

			{form.tasks.map((task, taskIndex) => (
				<Card
					key={task.id}
					size="small"
					title={
						<Input
							style={{ maxWidth: 320 }}
							placeholder="步骤组名称，如：登录"
							value={task.name}
							onChange={(e) => updateTask(taskIndex, { name: e.target.value })}
						/>
					}
					extra={
						<Space>
							<Button
								size="small"
								icon={<ArrowUpOutlined />}
								disabled={taskIndex === 0}
								onClick={() =>
									setForm((prev) => ({
										...prev,
										tasks: moveItem(prev.tasks, taskIndex, -1),
									}))
								}
							/>
							<Button
								size="small"
								icon={<ArrowDownOutlined />}
								disabled={taskIndex === form.tasks.length - 1}
								onClick={() =>
									setForm((prev) => ({
										...prev,
										tasks: moveItem(prev.tasks, taskIndex, 1),
									}))
								}
							/>
							<Button
								size="small"
								danger
								icon={<DeleteOutlined />}
								disabled={form.tasks.length === 1}
								onClick={() =>
									setForm((prev) => ({
										...prev,
										tasks: prev.tasks.filter((_, i) => i !== taskIndex),
									}))
								}
							/>
						</Space>
					}
				>
					<Flex vertical gap={8}>
						{task.steps.map((step, stepIndex) => (
							<Flex key={step.id} gap={8} align="center" wrap="wrap">
								<Typography.Text type="secondary" style={{ width: 24 }}>
									{stepIndex + 1}.
								</Typography.Text>
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
										updateStep(taskIndex, stepIndex, { name: e.target.value })
									}
								/>
								<Button
									size="small"
									icon={<ArrowUpOutlined />}
									disabled={stepIndex === 0}
									onClick={() =>
										updateTask(taskIndex, {
											steps: moveItem(task.steps, stepIndex, -1),
										})
									}
								/>
								<Button
									size="small"
									icon={<ArrowDownOutlined />}
									disabled={stepIndex === task.steps.length - 1}
									onClick={() =>
										updateTask(taskIndex, {
											steps: moveItem(task.steps, stepIndex, 1),
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
							</Flex>
						))}
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
				</Card>
			))}

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
								{errors.map((error) => (
									<li key={error}>{error}</li>
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
