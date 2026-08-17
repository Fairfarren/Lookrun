import { parse, stringify } from "yaml";

// 表单编辑模式的数据结构：与 YAML 双向转换，YAML 仍是唯一存储格式
// 这里只表达表单能覆盖的动作子集；超出子集的内容（xpath/deepLocate 等高级参数）
// 解析回表单时会返回失败，由界面降级到 YAML 高级模式

export interface FormStep {
	id: string;
	action: string;
	// 步骤自定义名称，对应 YAML 的 name 辅助键
	name?: string;
	params: Record<string, string | number | undefined>;
}

export interface FormTask {
	id: string;
	name: string;
	steps: FormStep[];
}

export type FormTarget =
	| {
			type: "web";
			url: string;
			viewportWidth?: number;
			viewportHeight?: number;
	  }
	| {
			type: "android";
			deviceId: string;
	  };

export interface FormScript {
	target: FormTarget;
	tasks: FormTask[];
}

export interface ActionField {
	key: string;
	label: string;
	type: "text" | "number" | "select";
	placeholder?: string;
	options?: { label: string; value: string }[];
	optional?: boolean;
}

// 表单支持的动作清单：下拉选项、参数表单、YAML 生成都以这份元数据为准
export const ACTION_OPTIONS: {
	action: string;
	label: string;
	fields: ActionField[];
	platforms?: FormTarget["type"][];
}[] = [
	{
		action: "launch",
		label: "打开 App",
		platforms: ["android"],
		fields: [
			{
				key: "target",
				label: "App 名称或包名",
				placeholder: "如：ctest 或 com.example.app",
				type: "text",
			},
		],
	},
	{
		action: "aiTap",
		label: "点击",
		fields: [
			{
				key: "locate",
				label: "点击什么",
				placeholder: "如：登录按钮",
				type: "text",
			},
		],
	},
	{
		action: "aiInput",
		label: "输入",
		fields: [
			{
				key: "locate",
				label: "在哪个输入框",
				placeholder: "如：用户名输入框",
				type: "text",
			},
			{
				key: "value",
				label: "输入内容",
				placeholder: "如：{{USERNAME}}",
				type: "text",
			},
		],
	},
	{
		action: "aiAssert",
		label: "断言验证",
		fields: [
			{
				key: "prompt",
				label: "验证什么",
				placeholder: "如：页面显示登录成功",
				type: "text",
			},
		],
	},
	{
		action: "aiWaitFor",
		label: "等待出现",
		fields: [
			{
				key: "prompt",
				label: "等待什么出现",
				placeholder: "如：页面跳转到首页",
				type: "text",
			},
			{
				key: "timeout",
				label: "超时(毫秒)",
				placeholder: "15000",
				type: "number",
				optional: true,
			},
		],
	},
	{
		action: "ai",
		label: "自由指令",
		fields: [
			{
				key: "prompt",
				label: "让 AI 做什么",
				placeholder: "如：关闭所有弹窗",
				type: "text",
			},
		],
	},
	{
		action: "aiHover",
		label: "悬停",
		platforms: ["web"],
		fields: [
			{
				key: "locate",
				label: "悬停在哪里",
				placeholder: "如：更多菜单",
				type: "text",
			},
		],
	},
	{
		action: "aiRightClick",
		label: "右键点击",
		platforms: ["web"],
		fields: [
			{
				key: "locate",
				label: "右键点击什么",
				placeholder: "如：文件图标",
				type: "text",
			},
		],
	},
	{
		action: "aiKeyboardPress",
		label: "按键",
		fields: [
			{
				key: "key",
				label: "按哪个键",
				type: "select",
				options: [
					"Enter",
					"Tab",
					"Escape",
					"Backspace",
					"ArrowUp",
					"ArrowDown",
					"ArrowLeft",
					"ArrowRight",
				].map((key) => ({
					label: key,
					value: key,
				})),
			},
		],
	},
	{
		action: "aiScroll",
		label: "滚动页面",
		fields: [
			{
				key: "direction",
				label: "方向",
				type: "select",
				options: [
					{ label: "向下", value: "down" },
					{ label: "向上", value: "up" },
					{ label: "向左", value: "left" },
					{ label: "向右", value: "right" },
				],
			},
			{
				key: "distance",
				label: "距离(像素)",
				placeholder: "留空自动",
				type: "number",
				optional: true,
			},
		],
	},
	{
		action: "aiQuery",
		label: "提取数据",
		fields: [
			{
				key: "prompt",
				label: "提取什么",
				placeholder: "如：{title: string} 页面标题",
				type: "text",
			},
		],
	},
	{
		action: "sleep",
		label: "固定等待",
		fields: [
			{ key: "ms", label: "等待毫秒数", placeholder: "1000", type: "number" },
		],
	},
];

const SUPPORTED_FORM_ACTIONS = ACTION_OPTIONS.map((option) => option.action);

export function actionOptionsForTarget(targetType: FormTarget["type"]) {
	return ACTION_OPTIONS.filter(
		(option) => !option.platforms || option.platforms.includes(targetType),
	);
}

export function createStepId() {
	return crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------- 表单 → YAML ----------

function stepToYamlObject(step: FormStep) {
	const params = step.params;
	let body: Record<string, unknown>;
	switch (step.action) {
		case "launch":
			body = { launch: params.target ?? "" };
			break;
		case "aiInput":
			body = {
				aiInput: { locate: params.locate ?? "", value: params.value ?? "" },
			};
			break;
		case "aiScroll": {
			const scroll: Record<string, unknown> = {
				direction: params.direction ?? "down",
			};
			if (params.distance !== undefined && params.distance !== "") {
				scroll.distance = Number(params.distance);
			}
			body = { aiScroll: scroll };
			break;
		}
		case "sleep":
			body = { sleep: Number(params.ms ?? 0) };
			break;
		case "aiWaitFor":
			body = { aiWaitFor: params.prompt ?? "" };
			if (params.timeout !== undefined && params.timeout !== "") {
				body.timeout = Number(params.timeout);
			}
			break;
		case "aiTap":
		case "aiHover":
		case "aiRightClick":
			body = { [step.action]: params.locate ?? "" };
			break;
		case "aiKeyboardPress":
			body = { aiKeyboardPress: params.key ?? "Enter" };
			break;
		default:
			body = { [step.action]: params.prompt ?? "" };
	}
	if (step.name && step.name.trim() !== "") {
		body.name = step.name.trim();
	}
	return body;
}

export function formToYaml(form: FormScript) {
	const doc: Record<string, unknown> = {};
	if (form.target.type === "web") {
		doc.target = form.target.url;
		if (form.target.viewportWidth !== undefined) {
			doc.viewportWidth = form.target.viewportWidth;
		}
		if (form.target.viewportHeight !== undefined) {
			doc.viewportHeight = form.target.viewportHeight;
		}
	} else {
		doc.android = { deviceId: form.target.deviceId };
	}
	doc.tasks = form.tasks.map((task) => ({
		name: task.name,
		flow: task.steps.map(stepToYamlObject),
	}));
	return stringify(doc);
}

// ---------- YAML → 表单 ----------

export type YamlToFormResult = { ok: true; form: FormScript } | { ok: false };

// 把 YAML 步骤解析为表单步骤，遇到表单无法表达的内容返回 null
function yamlStepToForm(
	step: unknown,
	targetType: FormTarget["type"],
): FormStep | null {
	if (!isRecord(step)) {
		return null;
	}
	const keys = Object.keys(step);
	const name = typeof step.name === "string" ? step.name : undefined;
	const timeout = typeof step.timeout === "number" ? step.timeout : undefined;
	const actionKeys = keys.filter((key) => key !== "name" && key !== "timeout");
	// 除 name/timeout 之外的键都必须是唯一动作，否则是表单不支持的高级参数
	if (
		actionKeys.length !== 1 ||
		!SUPPORTED_FORM_ACTIONS.includes(actionKeys[0])
	) {
		return null;
	}
	const action = actionKeys[0];
	const option = ACTION_OPTIONS.find((item) => item.action === action);
	if (option?.platforms && !option.platforms.includes(targetType)) {
		return null;
	}
	const raw = step[action];

	const text = (value: unknown) => (typeof value === "string" ? value : null);
	const formStep = (params: FormStep["params"]): FormStep => ({
		id: createStepId(),
		action,
		name,
		params,
	});

	switch (action) {
		case "launch": {
			const target = text(raw);
			return target === null ? null : formStep({ target });
		}
		case "ai":
		case "aiAssert":
		case "aiQuery":
		case "aiWaitFor": {
			const prompt = text(raw);
			if (prompt === null) return null;
			const params: FormStep["params"] = { prompt };
			if (action === "aiWaitFor" && timeout !== undefined) {
				params.timeout = timeout;
			}
			return formStep(params);
		}
		case "aiTap":
		case "aiHover":
		case "aiRightClick": {
			const locate = text(raw);
			return locate === null ? null : formStep({ locate });
		}
		case "aiKeyboardPress": {
			const key =
				typeof raw === "string"
					? raw
					: isRecord(raw) && typeof raw.key === "string"
						? raw.key
						: null;
			return key === null ? null : formStep({ key });
		}
		case "aiInput": {
			if (
				!isRecord(raw) ||
				typeof raw.locate !== "string" ||
				(typeof raw.value !== "string" && typeof raw.value !== "number")
			) {
				return null;
			}
			return formStep({ locate: raw.locate, value: String(raw.value) });
		}
		case "aiScroll": {
			if (
				!isRecord(raw) ||
				!["up", "down", "left", "right"].includes(String(raw.direction))
			) {
				return null;
			}
			const params: FormStep["params"] = { direction: String(raw.direction) };
			if (typeof raw.distance === "number") {
				params.distance = raw.distance;
			}
			return formStep(params);
		}
		case "sleep":
			return typeof raw === "number" ? formStep({ ms: raw }) : null;
		default:
			return null;
	}
}

export function yamlToForm(yamlText: string): YamlToFormResult {
	let doc: unknown;
	try {
		doc = parse(yamlText);
	} catch {
		return { ok: false };
	}
	if (!isRecord(doc) || !Array.isArray(doc.tasks) || doc.tasks.length === 0) {
		return { ok: false };
	}
	const hasWebTarget = typeof doc.target === "string";
	const hasAndroidTarget = isRecord(doc.android);
	if (hasWebTarget === hasAndroidTarget) {
		return { ok: false };
	}
	const target: FormTarget = hasWebTarget
		? {
			type: "web",
			url: String(doc.target),
			viewportWidth:
				typeof doc.viewportWidth === "number" ? doc.viewportWidth : undefined,
			viewportHeight:
				typeof doc.viewportHeight === "number" ? doc.viewportHeight : undefined,
		}
		: {
			type: "android",
			deviceId:
				isRecord(doc.android) && typeof doc.android.deviceId === "string"
					? doc.android.deviceId
					: "",
		};
	if (target.type === "android" && target.deviceId === "") {
		return { ok: false };
	}

	const tasks: FormTask[] = [];
	for (const task of doc.tasks) {
		if (
			!isRecord(task) ||
			typeof task.name !== "string" ||
			!Array.isArray(task.flow)
		) {
			return { ok: false };
		}
		const steps: FormStep[] = [];
		for (const step of task.flow) {
			const formStep = yamlStepToForm(step, target.type);
			if (!formStep) {
				return { ok: false };
			}
			steps.push(formStep);
		}
		tasks.push({ id: createStepId(), name: task.name, steps });
	}

	return {
		ok: true,
		form: {
			target,
			tasks,
		},
	};
}
