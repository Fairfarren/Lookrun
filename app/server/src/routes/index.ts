import type { Context, Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { errorText } from '../lib/error-text';
import {
    missingIdError,
    modelSelectError,
    moveDirectionError,
    parseRunListQuery,
    queueItemsOrEmpty,
    queueNameError,
    runStartBodyError,
    taskWriteError,
    variablesBodyError,
} from '../lib/route-input';
import { namedQueueUnavailable, startNamedQueueItems } from './queue-start';
import { formatRunHistory } from '../lib/ai-error';
import { detectChrome } from '../services/chrome';
import { DB_PATH, REPORT_DIR, SCREENSHOT_DIR } from '../config';
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
} from '../db';
import { Runner, ScriptInvalidError } from '../services/runner';
import { cancelQueueItem, listQueue, moveQueueItem } from '../services/queue';
import {
    createQueue,
    deleteQueue,
    getQueue,
    listQueues,
    updateQueue,
} from '../services/queue-defs';
import { broadcast } from '../lib/ws';
import { cleanupAllRuns, storageStats } from '../services/storage';
import {
    checkModelVision,
    getModelById,
    modelVisionCheckTarget,
    tryLoadModels,
} from '../services/models';
import pkg from '../../../../package.json';
import { getSetting, setSetting } from '../db';
import type { SystemInfo } from '@lookrun/shared';
import { parseScript } from '../lib/yamlflow';
import {
    checkAndroidDevice,
    listAndroidApps,
    listAndroidDevices,
} from '../services/android-service';
import { detectAdbPath } from '../services/android';

const SELECTED_MODEL_KEY = 'selectedModelId';

function yamlText(yaml: string | undefined) {
    return yaml ?? '';
}

function yamlValidateResponse(
    c: Context,
    result: { ok: true; errors?: string[] } | { ok: false; errors: string[] },
) {
    if (result.ok) {
        return c.json({ ok: true, errors: [] });
    }
    return c.json({ ok: false, errors: result.errors });
}

function jsonError(c: Context, error: string, status: 400 | 404 | 500) {
    return c.json({ error }, status);
}

function respondScriptInvalid(c: Context, error: unknown) {
    if (error instanceof ScriptInvalidError) {
        return c.json({ error: '脚本校验失败', errors: error.errors }, 400);
    }
    throw error;
}

async function writeExistingTask(c: Context, db: ReturnType<typeof createDb>, id: number) {
    const body = await c.req.json<{ name?: string; yaml?: string }>();
    const error = taskWriteError(body);
    if (error) {
        return jsonError(c, error, 400);
    }
    updateTask(db, id, { name: body.name!.trim(), yaml: body.yaml! });
    return c.json(getTask(db, id));
}

function modelExists(id: string) {
    const loaded = tryLoadModels();
    if (!loaded.ok) {
        return false;
    }
    return Boolean(getModelById(loaded.models, id));
}

function hasModel(id: string | undefined) {
    if (!id) {
        return false;
    }
    return modelExists(id);
}

function selectModel(c: Context, db: ReturnType<typeof createDb>, id: string | undefined) {
    const error = modelSelectError(id, hasModel(id));
    if (error) {
        return jsonError(c, error, 400);
    }
    setSetting(db, SELECTED_MODEL_KEY, id!);
    return c.json({ ok: true });
}

async function writeExistingQueue(c: Context, db: ReturnType<typeof createDb>, id: number) {
    const body = await c.req.json<{
        name?: string;
        items?: { taskId: number; modelId: string }[];
    }>();
    const error = queueNameError(body.name);
    if (error) {
        return jsonError(c, error, 400);
    }
    updateQueue(db, id, { name: body.name!.trim(), items: queueItemsOrEmpty(body.items) });
    return c.json(getQueue(db, id));
}

function startExistingTaskRun(
    c: Context,
    db: ReturnType<typeof createDb>,
    runner: Runner,
    taskId: number,
    modelId: string,
) {
    const task = getTask(db, taskId);
    if (!task) {
        return jsonError(c, '任务不存在', 404);
    }
    return startTaskRun(c, runner, task, modelId);
}

function startTaskRun(
    c: Context,
    runner: Runner,
    task: { id: number; name: string; yaml: string },
    modelId: string,
) {
    try {
        return c.json(
            runner.start({
                taskId: task.id,
                taskName: task.name,
                yaml: task.yaml,
                modelId,
            }),
        );
    } catch (error) {
        return respondScriptInvalid(c, error);
    }
}

async function listAndroidAppsOrError(c: Context, deviceId: string) {
    try {
        return c.json({ apps: await listAndroidApps(deviceId) });
    } catch (error) {
        return jsonError(c, errorText(error), 500);
    }
}

export function registerRoutes(app: Hono) {
    const db = createDb(DB_PATH);
    markStaleRunsStopped(db);
    const runner = new Runner(db);
    // 程序重启后恢复队列调度：上次中断的条目继续排队执行
    runner.resumeQueue();

    // ---------- 任务 ----------
    app.get('/api/tasks', (c) => c.json(listTasks(db)));

    app.post('/api/tasks', async (c) => {
        const body = await c.req.json<{ name?: string; yaml?: string }>();
        const error = taskWriteError(body);
        if (error) {
            return jsonError(c, error, 400);
        }
        const { id } = insertTask(db, { name: body.name!.trim(), yaml: body.yaml! });
        return c.json(getTask(db, id), 201);
    });

    app.get('/api/tasks/:id', (c) => {
        const task = getTask(db, Number(c.req.param('id')));
        return task ? c.json(task) : c.json({ error: '任务不存在' }, 404);
    });

    app.put('/api/tasks/:id', async (c) => {
        const id = Number(c.req.param('id'));
        if (!getTask(db, id)) {
            return jsonError(c, '任务不存在', 404);
        }
        return writeExistingTask(c, db, id);
    });

    app.delete('/api/tasks/:id', (c) => {
        const id = Number(c.req.param('id'));
        if (!getTask(db, id)) {
            return c.json({ error: '任务不存在' }, 404);
        }
        deleteTask(db, id);
        return c.json({ ok: true });
    });

    // YAML 校验：编辑器实时调用，返回全部错误
    app.post('/api/tasks/validate', async (c) => {
        const body = await c.req.json<{ yaml?: string }>();
        return yamlValidateResponse(c, parseScript(yamlText(body.yaml), listVariables(db)));
    });

    // ---------- 模型 ----------
    app.get('/api/models', (c) => {
        const loaded = tryLoadModels();
        if (!loaded.ok) {
            return jsonError(c, loaded.error, 500);
        }
        const models = loaded.models.map(({ id, name, model }) => ({
            id,
            name,
            model,
        }));
        return c.json({ models, selected: getSetting(db, SELECTED_MODEL_KEY) });
    });

    app.put('/api/models/select', async (c) => {
        const body = await c.req.json<{ id?: string }>();
        return selectModel(c, db, body.id);
    });

    // 视觉自检：验证模型能否看图并返回元素坐标
    app.post('/api/models/:id/check', async (c) => {
        const target = modelVisionCheckTarget(c.req.param('id'), tryLoadModels());
        if (!target.ok) {
            return jsonError(c, target.error, target.status);
        }
        return c.json(await checkModelVision(target.model));
    });

    // ---------- 变量 ----------
    app.get('/api/variables', (c) => c.json(listVariables(db)));

    app.put('/api/variables', async (c) => {
        const body = await c.req.json<{ variables?: Record<string, string> }>();
        const error = variablesBodyError(body.variables);
        if (error) {
            return jsonError(c, error, 400);
        }
        replaceVariables(db, body.variables!);
        return c.json({ ok: true });
    });

    // ---------- 运行 ----------
    app.post('/api/runs', async (c) => {
        const body = await c.req.json<{ taskId?: number; modelId?: string }>();
        const error = runStartBodyError(body.taskId, body.modelId);
        if (error) {
            return jsonError(c, error, 400);
        }
        return startExistingTaskRun(c, db, runner, body.taskId!, body.modelId!);
    });

    // ---------- 运行队列 ----------
    app.get('/api/queue', (c) => c.json({ items: listQueue(db) }));

    // 调整排队顺序：direction = up | down
    app.post('/api/queue/:id/move', async (c) => {
        const body = await c.req.json<{ direction?: 'up' | 'down' }>();
        const error = moveDirectionError(body.direction);
        if (error) {
            return jsonError(c, error, 400);
        }
        moveQueueItem(db, Number(c.req.param('id')), body.direction!);
        const items = listQueue(db);
        broadcast({ type: 'queue', items });
        return c.json({ items });
    });

    // 取消排队中的条目
    app.delete('/api/queue/:id', (c) => {
        cancelQueueItem(db, Number(c.req.param('id')));
        const items = listQueue(db);
        broadcast({ type: 'queue', items });
        return c.json({ items });
    });

    // ---------- 命名队列（可复用的固定任务集合，每天点一下开始全跑） ----------
    app.get('/api/queues', (c) => c.json({ items: listQueues(db) }));

    app.post('/api/queues', async (c) => {
        const body = await c.req.json<{ name?: string }>();
        const error = queueNameError(body.name);
        if (error) {
            return jsonError(c, error, 400);
        }
        return c.json(createQueue(db, { name: body.name!.trim() }), 201);
    });

    app.get('/api/queues/:id', (c) => {
        const q = getQueue(db, Number(c.req.param('id')));
        return q ? c.json(q) : c.json({ error: '队列不存在' }, 404);
    });

    app.put('/api/queues/:id', async (c) => {
        const id = Number(c.req.param('id'));
        if (!getQueue(db, id)) {
            return jsonError(c, '队列不存在', 404);
        }
        return writeExistingQueue(c, db, id);
    });

    app.delete('/api/queues/:id', (c) => {
        const id = Number(c.req.param('id'));
        if (!getQueue(db, id)) {
            return c.json({ error: '队列不存在' }, 404);
        }
        deleteQueue(db, id);
        return c.json({ ok: true });
    });

    // 启动命名队列：按顺序把每个任务交给 runner（第一个立即跑，后续自动入队）
    app.post('/api/queues/:id/start', (c) => {
        const q = getQueue(db, Number(c.req.param('id')));
        const unavailable = namedQueueUnavailable(q);
        if (unavailable) {
            return jsonError(c, unavailable.error, unavailable.status);
        }
        return c.json(
            startNamedQueueItems({
                items: q!.items,
                getTask: (taskId) => getTask(db, taskId),
                start: (task, modelId) =>
                    runner.start({
                        taskId: task.id,
                        taskName: task.name,
                        yaml: task.yaml,
                        modelId,
                    }),
            }),
        );
    });

    app.get('/api/runs/current', (c) => {
        const state = runner.current();
        return c.json({ status: state ? 'running' : 'idle', run: state });
    });

    app.post('/api/runs/current/stop', async (c) => {
        await runner.stop();
        return c.json({ ok: true });
    });

    app.get('/api/runs', (c) => {
        const query = parseRunListQuery({
            limit: c.req.query('limit'),
            offset: c.req.query('offset'),
        });
        return c.json({
            list: listRuns(db, query),
            total: countRuns(db),
        });
    });

    app.get('/api/runs/:id', (c) => {
        const id = Number(c.req.param('id'));
        const run = getRun(db, id);
        if (!run) {
            return c.json({ error: '运行记录不存在' }, 404);
        }
        return c.json(formatRunHistory(run, listRunSteps(db, id)));
    });

    // 步骤截图
    app.get(
        '/api/screenshots/*',
        serveStatic({
            root: SCREENSHOT_DIR,
            rewriteRequestPath: (path) => path.replace(/^\/api\/screenshots/, ''),
        }),
    );

    // ---------- 系统信息 ----------
    app.get('/api/system/android-devices', async (c) => {
        try {
            return c.json({ devices: await listAndroidDevices() });
        } catch (error) {
            return jsonError(c, errorText(error), 500);
        }
    });

    app.post('/api/system/android-devices/check', async (c) => {
        const body = await c.req.json<{ deviceId?: string }>();
        const error = missingIdError(body.deviceId, '请选择要检查的设备');
        if (error) {
            return jsonError(c, error, 400);
        }
        return c.json(await checkAndroidDevice(body.deviceId!.trim()));
    });

    app.get('/api/system/android-apps', async (c) => {
        const deviceId = c.req.query('deviceId')?.trim();
        const error = missingIdError(deviceId, '请选择要查询应用的设备');
        if (error) {
            return jsonError(c, error, 400);
        }
        return listAndroidAppsOrError(c, deviceId!);
    });

    app.get('/api/system', (c) => {
        const chrome = detectChrome();
        const info: SystemInfo = {
            chromePath: chrome.path,
            adbPath: detectAdbPath(),
            chromeSource: chrome.source,
            dataDir: DB_PATH.replace(/\/app\.db$/, ''),
            version: pkg.version,
        };
        return c.json(info);
    });

    // 存储占用统计
    app.get('/api/system/storage', (c) => {
        return c.json(
            storageStats(db, {
                dbPath: DB_PATH,
                screenshotDir: SCREENSHOT_DIR,
                reportDir: REPORT_DIR,
            }),
        );
    });

    // 清空全部历史运行（任务与变量不受影响）
    app.post('/api/system/storage/cleanup', (c) => {
        const result = cleanupAllRuns(db, SCREENSHOT_DIR, REPORT_DIR);
        return c.json(result);
    });
}
