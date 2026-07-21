// 前后端共享的数据结构定义

export interface TaskRecord {
	id: number;
	name: string;
	yaml: string;
	createdAt: string;
	updatedAt: string;
}

export type RunStatus = "running" | "success" | "failed" | "stopped";

export interface RunRecord {
	id: number;
	taskId: number | null;
	taskName: string;
	model: string;
	status: RunStatus;
	error: string | null;
	startedAt: string;
	finishedAt: string | null;
	durationMs: number | null;
	tokenInput: number;
	tokenOutput: number;
}

export type StepStatus = "success" | "failed";

export interface RunStepRecord {
	id: number;
	runId: number;
	stepIndex: number;
	stepName: string | null;
	action: string;
	url: string | null;
	prompt: string | null;
	aiResult: string | null;
	shotBefore: string | null;
	shotAfter: string | null;
	durationMs: number | null;
	tokenInput: number;
	tokenOutput: number;
	status: StepStatus;
	error: string | null;
	createdAt: string;
}

export interface ModelConfig {
	id: string;
	name: string;
	// 传给 Midscene 的模型标识，如 gemma4:cloud
	model: string;
	baseUrl: string;
	apiKey: string;
	// Midscene 的 MIDSCENE_MODEL_FAMILY，如 kimi；不在已知列表则不传
	family?: string;
}

export interface SystemInfo {
	chromePath: string | null;
	// env 环境变量 / detected 固定路径 / registry 注册表(Win) / spotlight Spotlight(Mac) / which which命令(Linux) / none 未找到
	chromeSource:
		| "env"
		| "detected"
		| "registry"
		| "spotlight"
		| "which"
		| "none";
	dataDir: string;
	version: string;
}
