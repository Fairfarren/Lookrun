import { afterEach, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createDb, insertTask, insertRun } from '../src/db';
import { registerRoutes } from '../src/routes';
import { ScriptInvalidError } from '../src/services/runner';
import { enqueue } from '../src/services/queue';

type Dependencies = NonNullable<Parameters<typeof registerRoutes>[1]>;
const databases: ReturnType<typeof createDb>[] = [];
afterEach(() => {
    for (const db of databases.splice(0)) db.close();
});

function setup(options: {
    modelError?: boolean;
    deviceError?: boolean;
    runError?: Error;
    running?: boolean;
}) {
    const db = createDb(':memory:');
    databases.push(db);
    const events: unknown[] = [];
    const started: unknown[] = [];
    let stopped = false;
    let resumed = false;
    let config = {
        baseUrl: 'https://model.test',
        apiKey: 'secret',
        models: [{ id: 'model', name: '模型', model: 'vision', family: 'qwen' }],
    };
    class RunnerStub {
        resumeQueue() {
            resumed = true;
        }
        start(input: unknown) {
            if (options.runError) throw options.runError;
            started.push(input);
            return { queued: false, runId: 42 };
        }
        current() {
            return options.running ? { runId: 42 } : null;
        }
        async stop() {
            stopped = true;
        }
    }
    const app = new Hono();
    registerRoutes(app, {
        createDb: () => db,
        Runner: RunnerStub as unknown as Dependencies['Runner'],
        readModelSettings: () => config,
        writeModelSettings: async (next) => {
            config = next;
        },
        tryLoadModels: () =>
            options.modelError
                ? { ok: false, error: '配置损坏' }
                : {
                      ok: true,
                      models: [
                          { ...config.models[0], baseUrl: config.baseUrl, apiKey: config.apiKey },
                      ],
                  },
        checkModelVision: async () => ({ ok: true, message: '视觉可用' }),
        listAndroidDevices: async () => {
            if (options.deviceError) throw new Error('设备离线');
            return [{ id: 'device', name: '设备' }];
        },
        checkAndroidDevice: async (id) => ({ ok: true, device: { id, name: '设备' } }),
        listAndroidApps: async () => {
            if (options.deviceError) throw new Error('应用列表不可用');
            return [{ packageName: 'app.test' }];
        },
        detectChrome: () => ({ path: '/stub/chrome', source: 'env' }),
        detectAdbPath: () => '/stub/adb',
        storageStats: (() => ({ runsCount: 3 })) as unknown as Dependencies['storageStats'],
        cleanupAllRuns: (() => ({ deletedRuns: 3 })) as unknown as Dependencies['cleanupAllRuns'],
        broadcast: (event) => {
            events.push(event);
        },
    });
    const request = async <T>(url: string, input?: { method: string; body?: unknown }) => {
        const response = await app.request(
            url,
            input
                ? {
                      method: input.method,
                      headers: { 'Content-Type': 'application/json' },
                      body: input.body === undefined ? undefined : JSON.stringify(input.body),
                  }
                : undefined,
        );
        return { status: response.status, body: (await response.json()) as T };
    };
    return { app, db, request, started, events, stopped: () => stopped, resumed: () => resumed };
}

const validYaml = 'target: https://page.test\ntasks:\n  - name: 测试\n    flow:\n      - ai: 操作';

test('任务路由完成创建读取修改删除并验证最终结果', async () => {
    const state = setup({});

    const created = await state.request<{ id: number }>('/api/tasks', {
        method: 'POST',
        body: { name: ' 初始任务 ', yaml: validYaml },
    });
    const listed = await state.request<{ name: string }[]>('/api/tasks');
    const updated = await state.request<{ name: string }>(`/api/tasks/${created.body.id}`, {
        method: 'PUT',
        body: { name: '修改任务', yaml: validYaml },
    });
    const read = await state.request<{ name: string }>(`/api/tasks/${created.body.id}`);
    const deleted = await state.request(`/api/tasks/${created.body.id}`, { method: 'DELETE' });
    const missing = await state.request(`/api/tasks/${created.body.id}`);

    expect({
        created: created.status,
        listed: listed.body[0].name,
        updated: updated.body.name,
        read: read.body.name,
        deleted,
        missing,
        resumed: state.resumed(),
    }).toEqual({
        created: 201,
        listed: '初始任务',
        updated: '修改任务',
        read: '修改任务',
        deleted: { status: 200, body: { ok: true } },
        missing: { status: 404, body: { error: '任务不存在' } },
        resumed: true,
    });
});

test.each(['PUT', 'DELETE'])('不存在的任务不能%s', async (method) => {
    const state = setup({});

    expect(await state.request('/api/tasks/999', { method, body: {} })).toEqual({
        status: 404,
        body: { error: '任务不存在' },
    });
});

test('非法任务内容返回校验错误且不写入', async () => {
    const state = setup({});
    const { id } = insertTask(state.db, { name: '原任务', yaml: validYaml });

    const responses = await Promise.all([
        state.request('/api/tasks', { method: 'POST', body: {} }),
        state.request(`/api/tasks/${id}`, { method: 'PUT', body: { name: '', yaml: validYaml } }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
});

test('YAML验证同时支持合法和缺失脚本', async () => {
    const state = setup({});

    const valid = await state.request('/api/tasks/validate', {
        method: 'POST',
        body: { yaml: validYaml },
    });
    const invalid = await state.request<{ ok: boolean }>('/api/tasks/validate', {
        method: 'POST',
        body: {},
    });

    expect({ valid, invalid: invalid.body.ok }).toEqual({
        valid: { status: 200, body: { ok: true, errors: [] } },
        invalid: false,
    });
});

test('默认模型保存后列表返回选中值且配置密钥不泄露', async () => {
    const state = setup({});

    const selected = await state.request('/api/models/select', {
        method: 'PUT',
        body: { id: 'model' },
    });
    const models = await state.request('/api/models');
    const config = await state.request('/api/models/config');

    expect({ selected, models, secret: JSON.stringify(config).includes('secret') }).toEqual({
        selected: { status: 200, body: { ok: true } },
        models: {
            status: 200,
            body: { models: [{ id: 'model', name: '模型', model: 'vision' }], selected: 'model' },
        },
        secret: false,
    });
});

test.each([{}, { id: 'missing' }])('无效默认模型请求返回400：%j', async (body) => {
    const state = setup({});

    expect((await state.request('/api/models/select', { method: 'PUT', body })).status).toBe(400);
});

test('模型读取失败阻止选择与视觉检查', async () => {
    const state = setup({ modelError: true });

    const responses = await Promise.all([
        state.request('/api/models'),
        state.request('/api/models/select', { method: 'PUT', body: { id: 'model' } }),
        state.request('/api/models/model/check', { method: 'POST' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([500, 400, 500]);
});

test('有效模型的视觉检查返回检测结果', async () => {
    const state = setup({});

    expect(await state.request('/api/models/model/check', { method: 'POST' })).toEqual({
        status: 200,
        body: { ok: true, message: '视觉可用' },
    });
});

test('变量路由保存后可以读取，非法数据拒绝覆盖', async () => {
    const state = setup({});

    const saved = await state.request('/api/variables', {
        method: 'PUT',
        body: { variables: { user: 'tester' } },
    });
    const rejected = await state.request('/api/variables', {
        method: 'PUT',
        body: { variables: [] },
    });
    const read = await state.request('/api/variables');

    expect({ saved: saved.status, rejected: rejected.status, read }).toEqual({
        saved: 200,
        rejected: 400,
        read: { status: 200, body: { user: 'tester' } },
    });
});

test('运行路由使用已保存任务并返回启动结果', async () => {
    const state = setup({});
    const task = insertTask(state.db, { name: '任务', yaml: validYaml });

    const result = await state.request('/api/runs', {
        method: 'POST',
        body: { taskId: task.id, modelId: 'model' },
    });

    expect({ result, started: state.started }).toEqual({
        result: { status: 200, body: { queued: false, runId: 42 } },
        started: [{ taskId: task.id, taskName: '任务', yaml: validYaml, modelId: 'model' }],
    });
});

test('运行缺少参数或任务不存在时拒绝启动', async () => {
    const state = setup({});

    const invalid = await state.request('/api/runs', { method: 'POST', body: {} });
    const missing = await state.request('/api/runs', {
        method: 'POST',
        body: { taskId: 999, modelId: 'model' },
    });

    expect([invalid.status, missing.status]).toEqual([400, 404]);
});

test('脚本校验失败返回明确错误列表', async () => {
    const state = setup({ runError: new ScriptInvalidError(['脚本错误']) });
    const task = insertTask(state.db, { name: '任务', yaml: validYaml });

    expect(
        await state.request('/api/runs', {
            method: 'POST',
            body: { taskId: task.id, modelId: 'model' },
        }),
    ).toEqual({ status: 400, body: { error: '脚本校验失败', errors: ['脚本错误'] } });
});

test('未知运行异常由框架错误处理器返回500', async () => {
    const state = setup({ runError: new Error('内部错误') });
    state.app.onError((_error, c) => c.json({ error: '内部错误' }, 500));
    const task = insertTask(state.db, { name: '任务', yaml: validYaml });

    expect(
        (
            await state.request('/api/runs', {
                method: 'POST',
                body: { taskId: task.id, modelId: 'model' },
            })
        ).status,
    ).toBe(500);
});

test('运行中和空闲状态可读，停止请求触达执行器', async () => {
    const running = setup({ running: true });
    const idle = setup({});

    const active = await running.request('/api/runs/current');
    const stopped = await running.request('/api/runs/current/stop', { method: 'POST' });
    const empty = await idle.request('/api/runs/current');

    expect({ active, stopped: stopped.status, called: running.stopped(), empty }).toEqual({
        active: { status: 200, body: { status: 'running', run: { runId: 42 } } },
        stopped: 200,
        called: true,
        empty: { status: 200, body: { status: 'idle', run: null } },
    });
});

test('运行队列移动和取消后广播最新顺序', async () => {
    const state = setup({});
    const task = insertTask(state.db, { name: '任务', yaml: validYaml });
    const first = enqueue(state.db, {
        taskId: task.id,
        taskName: '一',
        modelId: 'model',
        model: 'vision',
    });
    const second = enqueue(state.db, {
        taskId: task.id,
        taskName: '二',
        modelId: 'model',
        model: 'vision',
    });

    const listed = await state.request<{ items: { taskName: string }[] }>('/api/queue');
    const invalid = await state.request(`/api/queue/${second.id}/move`, {
        method: 'POST',
        body: {},
    });
    const moved = await state.request<{ items: { taskName: string }[] }>(
        `/api/queue/${second.id}/move`,
        { method: 'POST', body: { direction: 'up' } },
    );
    const cancelled = await state.request<{ items: { taskName: string }[] }>(
        `/api/queue/${first.id}`,
        { method: 'DELETE' },
    );

    expect({
        listed: listed.body.items.map((item: { taskName: string }) => item.taskName),
        invalid: invalid.status,
        moved: moved.body.items.map((item: { taskName: string }) => item.taskName),
        cancelled: cancelled.body.items.map((item: { taskName: string }) => item.taskName),
        events: state.events.length,
    }).toEqual({
        listed: ['一', '二'],
        invalid: 400,
        moved: ['二', '一'],
        cancelled: ['二'],
        events: 2,
    });
});

test('命名队列完成创建编辑启动与删除', async () => {
    const state = setup({});
    const task = insertTask(state.db, { name: '任务', yaml: validYaml });

    const created = await state.request<{ id: number }>('/api/queues', {
        method: 'POST',
        body: { name: ' 队列 ' },
    });
    const id = created.body.id;
    const updated = await state.request<{ name: string }>(`/api/queues/${id}`, {
        method: 'PUT',
        body: { name: '修改队列', items: [{ taskId: task.id, modelId: 'model' }] },
    });
    const listed = await state.request<{ items: { name: string }[] }>('/api/queues');
    const read = await state.request<{ name: string }>(`/api/queues/${id}`);
    const started = await state.request(`/api/queues/${id}/start`, { method: 'POST' });
    const deleted = await state.request(`/api/queues/${id}`, { method: 'DELETE' });

    expect({
        created: created.status,
        updated: updated.body.name,
        listed: listed.body.items[0].name,
        read: read.body.name,
        started: started.status,
        launches: state.started.length,
        deleted: deleted.status,
    }).toEqual({
        created: 201,
        updated: '修改队列',
        listed: '修改队列',
        read: '修改队列',
        started: 200,
        launches: 1,
        deleted: 200,
    });
});

test.each(['GET', 'PUT', 'DELETE'])('不存在的命名队列返回404：%s', async (method) => {
    const state = setup({});

    expect(
        (
            await state.request('/api/queues/999', {
                method,
                body: method === 'PUT' ? {} : undefined,
            })
        ).status,
    ).toBe(404);
});

test('命名队列缺少名称或条目时返回校验结果', async () => {
    const state = setup({});
    const created = await state.request<{ id: number }>('/api/queues', {
        method: 'POST',
        body: { name: '空队列' },
    });

    const responses = await Promise.all([
        state.request('/api/queues', { method: 'POST', body: {} }),
        state.request(`/api/queues/${created.body.id}`, { method: 'PUT', body: {} }),
        state.request(`/api/queues/${created.body.id}/start`, { method: 'POST' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400]);
});

test('历史记录支持列表和详情读取', async () => {
    const state = setup({});
    const run = insertRun(state.db, { taskId: null, taskName: '历史', model: 'vision' });

    const list = await state.request<{ total: number }>('/api/runs?limit=10&offset=0');
    const detail = await state.request<{ run: { taskName: string } }>(`/api/runs/${run.id}`);
    const missing = await state.request('/api/runs/999');

    expect({
        count: list.body.total,
        name: detail.body.run.taskName,
        missing: missing.status,
    }).toEqual({ count: 1, name: '历史', missing: 404 });
});

test('设备与应用查询返回可用结果', async () => {
    const state = setup({});

    const devices = await state.request('/api/system/android-devices');
    const checked = await state.request('/api/system/android-devices/check', {
        method: 'POST',
        body: { deviceId: ' device ' },
    });
    const apps = await state.request('/api/system/android-apps?deviceId=device');

    expect({ devices, checked, apps }).toEqual({
        devices: { status: 200, body: { devices: [{ id: 'device', name: '设备' }] } },
        checked: { status: 200, body: { ok: true, device: { id: 'device', name: '设备' } } },
        apps: { status: 200, body: { apps: [{ packageName: 'app.test' }] } },
    });
});

test('设备离线与缺失参数均返回失败状态', async () => {
    const state = setup({ deviceError: true });

    const responses = await Promise.all([
        state.request('/api/system/android-devices'),
        state.request('/api/system/android-devices/check', { method: 'POST', body: {} }),
        state.request('/api/system/android-apps'),
        state.request('/api/system/android-apps?deviceId=device'),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([500, 400, 400, 500]);
});

test('系统信息与存储清理路由返回当前资源状态', async () => {
    const state = setup({});

    const system = await state.request<{ chromePath: string; adbPath: string }>('/api/system');
    const stats = await state.request('/api/system/storage');
    const cleanup = await state.request('/api/system/storage/cleanup', { method: 'POST' });

    expect({ chrome: system.body.chromePath, adb: system.body.adbPath, stats, cleanup }).toEqual({
        chrome: '/stub/chrome',
        adb: '/stub/adb',
        stats: { status: 200, body: { runsCount: 3 } },
        cleanup: { status: 200, body: { deletedRuns: 3 } },
    });
});

test('模型配置保存通过主路由更新默认选择', async () => {
    const state = setup({});

    const saved = await state.request('/api/models/config', {
        method: 'PUT',
        body: {
            baseUrl: 'https://model.test',
            apiKey: 'key',
            models: [{ id: 'next', model: 'vision' }],
        },
    });
    const models = await state.request<{ selected: string }>('/api/models');

    expect({ status: saved.status, selected: models.body.selected }).toEqual({
        status: 200,
        selected: 'next',
    });
});

test('截图路由不存在的文件返回404', async () => {
    const state = setup({});

    const response = await state.app.request('/api/screenshots/does-not-exist.png');

    expect(response.status).toBe(404);
});
