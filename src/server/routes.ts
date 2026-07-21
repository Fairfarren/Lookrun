import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { detectChrome } from "./chrome";
import { DB_PATH, REPORT_DIR, SCREENSHOT_DIR } from "./config";
import {
	countRuns,
	createDb,
	deleteTask,
	getRun,
	getTask,
	insertTask,
	listRuns,
	listRunSteps,
	listTasks,
	listVariables,
	markStaleRunsStopped,
	replaceVariables,
	updateTask,
} from "./db";
import { Runner, ScriptInvalidError } from "./runner";
import { cancelQueueItem, listQueue, moveQueueItem } from "./queue";
import { broadcast } from "./ws";
import { cleanupAllRuns, storageStats } from "./storage";
import { checkModelVision, getModelById, loadModels } from "./models";
import pkg from "../../package.json";
import { getSetting, setSetting } from "./db";
import type { SystemInfo } from "../shared/types";
import { parseScript } from "./yamlflow";

const SELECTED_MODEL_KEY = "selectedModelId";

export function registerRoutes(app: Hono) {
	const db = createDb(DB_PATH);
	markStaleRunsStopped(db);
	const runner = new Runner(db);
	// 程序重启后恢复队列调度：上次中断的条目继续排队执行
	runner.resumeQueue();

	// ---------- 任务 ----------
	app.get("/api/tasks", (c) => c.json(listTasks(db)));

	app.post("/api/tasks", async (c) => {
		const body = await c.req.json<{ name?: string; yaml?: string }>();
		if (!body.name?.trim() || !body.yaml?.trim()) {
			return c.json({ error: "任务名和 YAML 内容不能为空" }, 400);
		}
		const { id } = insertTask(db, { name: body.name.trim(), yaml: body.yaml });
		return c.json(getTask(db, id), 201);
	});

	app.get("/api/tasks/:id", (c) => {
		const task = getTask(db, Number(c.req.param("id")));
		return task ? c.json(task) : c.json({ error: "任务不存在" }, 404);
	});

	app.put("/api/tasks/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!getTask(db, id)) {
			return c.json({ error: "任务不存在" }, 404);
		}
		const body = await c.req.json<{ name?: string; yaml?: string }>();
		if (!body.name?.trim() || !body.yaml?.trim()) {
			return c.json({ error: "任务名和 YAML 内容不能为空" }, 400);
		}
		updateTask(db, id, { name: body.name.trim(), yaml: body.yaml });
		return c.json(getTask(db, id));
	});

	app.delete("/api/tasks/:id", (c) => {
		const id = Number(c.req.param("id"));
		if (!getTask(db, id)) {
			return c.json({ error: "任务不存在" }, 404);
		}
		deleteTask(db, id);
		return c.json({ ok: true });
	});

	// YAML 校验：编辑器实时调用，返回全部错误
	app.post("/api/tasks/validate", async (c) => {
		const body = await c.req.json<{ yaml?: string }>();
		const result = parseScript(body.yaml ?? "", listVariables(db));
		return result.ok
			? c.json({ ok: true, errors: [] })
			: c.json({ ok: false, errors: result.errors });
	});

	// ---------- 模型 ----------
	app.get("/api/models", (c) => {
		try {
			const models = loadModels().map(({ id, name, model }) => ({
				id,
				name,
				model,
			}));
			return c.json({ models, selected: getSetting(db, SELECTED_MODEL_KEY) });
		} catch (error) {
			return c.json(
				{ error: error instanceof Error ? error.message : String(error) },
				500,
			);
		}
	});

	app.put("/api/models/select", async (c) => {
		const body = await c.req.json<{ id?: string }>();
		if (!body.id || !getModelById(loadModels(), body.id)) {
			return c.json({ error: "模型不存在" }, 400);
		}
		setSetting(db, SELECTED_MODEL_KEY, body.id);
		return c.json({ ok: true });
	});

	// 视觉自检：验证模型能否看图并返回元素坐标
	app.post("/api/models/:id/check", async (c) => {
		const model = getModelById(loadModels(), c.req.param("id"));
		if (!model) {
			return c.json({ error: "模型不存在" }, 404);
		}
		const result = await checkModelVision(model);
		return c.json(result);
	});

	// ---------- 变量 ----------
	app.get("/api/variables", (c) => c.json(listVariables(db)));

	app.put("/api/variables", async (c) => {
		const body = await c.req.json<{ variables?: Record<string, string> }>();
		if (!body.variables || typeof body.variables !== "object") {
			return c.json({ error: "variables 必须是对象" }, 400);
		}
		replaceVariables(db, body.variables);
		return c.json({ ok: true });
	});

	// ---------- 运行 ----------
	app.post("/api/runs", async (c) => {
		const body = await c.req.json<{ taskId?: number; modelId?: string }>();
		if (!body.taskId || !body.modelId) {
			return c.json({ error: "缺少 taskId 或 modelId" }, 400);
		}
		const task = getTask(db, body.taskId);
		if (!task) {
			return c.json({ error: "任务不存在" }, 404);
		}
		try {
			const result = runner.start({
				taskId: task.id,
				taskName: task.name,
				yaml: task.yaml,
				modelId: body.modelId,
			});
			// queued=false 立即执行；queued=true 已入队排队
			return c.json(result);
		} catch (error) {
			if (error instanceof ScriptInvalidError) {
				return c.json({ error: "脚本校验失败", errors: error.errors }, 400);
			}
			throw error;
		}
	});

	// ---------- 运行队列 ----------
	app.get("/api/queue", (c) => c.json({ items: listQueue(db) }));

	// 调整排队顺序：direction = up | down
	app.post("/api/queue/:id/move", async (c) => {
		const body = await c.req.json<{ direction?: "up" | "down" }>();
		if (body.direction !== "up" && body.direction !== "down") {
			return c.json({ error: "direction 必须是 up 或 down" }, 400);
		}
		moveQueueItem(db, Number(c.req.param("id")), body.direction);
		const items = listQueue(db);
		broadcast({ type: "queue", items });
		return c.json({ items });
	});

	// 取消排队中的条目
	app.delete("/api/queue/:id", (c) => {
		cancelQueueItem(db, Number(c.req.param("id")));
		const items = listQueue(db);
		broadcast({ type: "queue", items });
		return c.json({ items });
	});

	app.get("/api/runs/current", (c) => {
		const state = runner.current();
		return c.json({ status: state ? "running" : "idle", run: state });
	});

	app.post("/api/runs/current/stop", async (c) => {
		await runner.stop();
		return c.json({ ok: true });
	});

	app.get("/api/runs", (c) => {
		const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
		const offset = Number(c.req.query("offset")) || 0;
		return c.json({
			list: listRuns(db, { limit, offset }),
			total: countRuns(db),
		});
	});

	app.get("/api/runs/:id", (c) => {
		const id = Number(c.req.param("id"));
		const run = getRun(db, id);
		if (!run) {
			return c.json({ error: "运行记录不存在" }, 404);
		}
		return c.json({ run, steps: listRunSteps(db, id) });
	});

	// 步骤截图
	app.get(
		"/api/screenshots/*",
		serveStatic({
			root: SCREENSHOT_DIR,
			rewriteRequestPath: (path) => path.replace(/^\/api\/screenshots/, ""),
		}),
	);

	// ---------- 系统信息 ----------
	app.get("/api/system", (c) => {
		const chrome = detectChrome();
		const info: SystemInfo = {
			chromePath: chrome.path,
			chromeSource: chrome.source,
			dataDir: DB_PATH.replace(/\/app\.db$/, ""),
			version: pkg.version,
		};
		return c.json(info);
	});

	// 存储占用统计
	app.get("/api/system/storage", (c) => {
		return c.json(
			storageStats(db, {
				dbPath: DB_PATH,
				screenshotDir: SCREENSHOT_DIR,
				reportDir: REPORT_DIR,
			}),
		);
	});

	// 清空全部历史运行（任务与变量不受影响）
	app.post("/api/system/storage/cleanup", (c) => {
		const result = cleanupAllRuns(db, SCREENSHOT_DIR, REPORT_DIR);
		return c.json(result);
	});
}
