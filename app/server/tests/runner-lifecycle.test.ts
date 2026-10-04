import { afterEach, expect, test } from 'bun:test';
import { Runner, ScriptInvalidError } from '../src/services/runner';
import { createDb, getRun, insertTask, listRuns, listRunSteps } from '../src/db';
import { enqueue, listQueue, setQueueStatus } from '../src/services/queue';

type Dependencies = NonNullable<ConstructorParameters<typeof Runner>[1]>;
const databases: ReturnType<typeof createDb>[] = [];
afterEach(() => {
    for (const db of databases.splice(0)) db.close();
});

function setup(options: {
    failAction?: boolean;
    failOpen?: boolean;
    pause?: Promise<void>;
    modelsError?: string;
    missingChrome?: boolean;
    cleanupError?: boolean;
    android?: boolean;
    deviceOffline?: boolean;
    previewFailure?: boolean;
    previewAbsent?: boolean;
    click?: boolean;
    pageGroups?: boolean;
    closeError?: 'sync' | 'async';
    deviceCleanupError?: boolean;
    screenshotError?: boolean;
    mockAi?: boolean;
    retentionError?: boolean;
    foregroundError?: boolean;
    broadcastError?: boolean;
}) {
    // 内存 SQLite 验证真实运行记录和队列状态；浏览器、模型和截图文件均使用桩。
    const db = createDb(':memory:');
    databases.push(db);
    const model = {
        id: 'model',
        name: '测试模型',
        model: 'vision',
        apiKey: 'key',
        baseUrl: 'https://model.test',
        family: 'qwen2.5-vl',
    };
    const completed = Promise.withResolvers<void>();
    const stepStarted = Promise.withResolvers<void>();
    const cleanupObserved = Promise.withResolvers<void>();
    const diagnosticReceived = Promise.withResolvers<void>();
    const diagnostics: string[] = [];
    let screenshots = 0;
    const files = new Map<string, Buffer>();
    const actions: string[] = [];
    const pages: string[] = [];
    const resources = { browserClosed: false, screencastStopped: false, retained: false };
    const androidResources = { connected: false, destroyed: false, previewStopped: false };
    let location = '';
    class Agent {
        constructor(
            _page: unknown,
            private config: { onLLMUsage: (usage: Record<string, number>) => void },
        ) {}
        async getActionSpace() {
            return [];
        }
        async ai(prompt: string) {
            stepStarted.resolve();
            await options.pause;
            if (options.failAction) throw new Error('模型执行失败');
            actions.push(prompt);
            this.config.onLLMUsage({ prompt_tokens: 10, completion_tokens: 4 });
            return '执行完成';
        }
        async launch(target: string) {
            actions.push(`启动${target}`);
        }
        async aiTap(prompt: string) {
            actions.push(prompt);
        }
        async destroy() {
            androidResources.destroyed = true;
            if (options.deviceCleanupError) throw new Error('设备释放失败');
        }
        dumpDataString() {
            return options.click
                ? JSON.stringify({
                      executions: [
                          { name: 'aiTap', tasks: [{ output: { element: { center: [10, 20] } } }] },
                      ],
                  })
                : '';
        }
    }
    class Device {
        async connect() {
            androidResources.connected = true;
        }
        async screenshotBase64() {
            return Buffer.from('设备截图').toString('base64');
        }
        async url() {
            return 'app.test';
        }
        async openFrameSource() {
            if (options.previewFailure) throw new Error('预览不可用');
            return options.previewAbsent ? null : { source: '帧源' };
        }
    }
    const browser = {
        newPage: async () => ({
            setViewport: async () => {},
            goto: async (url: string) => {
                location = url;
                pages.push(url);
            },
            screenshot: async () => {
                screenshots += 1;
                if (options.screenshotError && screenshots > 1) throw new Error('截图失败');
                return Buffer.from('测试截图').toString('base64');
            },
            url: () => location,
            bringToFront: async () => {
                if (options.foregroundError) throw new Error('窗口前置失败');
            },
        }),
        close: () => {
            resources.browserClosed = true;
            if (options.closeError === 'sync') throw new Error('同步关闭失败');
            if (options.closeError === 'async') return Promise.reject(new Error('异步关闭失败'));
            return Promise.resolve();
        },
    };
    const dependencies: Dependencies = {
        tryLoadModels: () =>
            options.modelsError
                ? { ok: false, error: options.modelsError }
                : { ok: true, models: [model] },
        loadModels: () => {
            if (options.modelsError) throw new Error(options.modelsError);
            return [model];
        },
        detectChrome: () => ({
            path: options.missingChrome ? null : '/stub/chrome',
            source: 'detected',
        }),
        launchBrowser: (async () => {
            if (options.failOpen) throw new Error('浏览器启动失败');
            return browser;
        }) as unknown as Dependencies['launchBrowser'],
        PuppeteerAgent: Agent as unknown as Dependencies['PuppeteerAgent'],
        AndroidAgent: Agent as unknown as Dependencies['AndroidAgent'],
        AndroidDevice: Device as unknown as Dependencies['AndroidDevice'],
        checkAndroidDevice: async () =>
            options.deviceOffline
                ? { ok: false, message: '设备离线' }
                : { ok: true, device: { id: 'device', name: '设备' } },
        androidAdbPath: () => '/stub/adb',
        hasWsClients: () => true,
        startAndroidLivePreview: (input) => {
            if (input.hasViewer()) input.publish('实时帧');
            input.onError(new Error('丢弃损坏帧'));
            return async () => {
                androidResources.previewStopped = true;
            };
        },
        createDeviceAndroidAppLauncher:
            ({ directLaunch }) =>
            async (target) => {
                await directLaunch(target);
            },
        file: ((file: string) => ({
            arrayBuffer: async () => files.get(file)!.buffer,
        })) as unknown as Dependencies['file'],
        markClickOnScreenshot: async (data) => Buffer.concat([data, Buffer.from('标记')]),
        startScreencast: async () => async () => {
            resources.screencastStopped = true;
            if (options.cleanupError) throw new Error('预览关闭失败');
        },
        mkdirSync: (() => undefined) as Dependencies['mkdirSync'],
        write: (async (file: string, data: Buffer) => {
            files.set(String(file), data);
            return data.length;
        }) as Dependencies['write'],
        cleanupOldRuns: () => {
            resources.retained = true;
            cleanupObserved.resolve();
            if (options.retentionError) throw new Error('历史清理失败');
            return [];
        },
        mockAi: Boolean(options.mockAi),
        warn: (message) => {
            diagnostics.push(message);
        },
        error: (message) => {
            diagnostics.push(message);
            diagnosticReceived.resolve();
        },
        broadcast: (message) => {
            const isQueue = (message as { type: string }).type === 'queue';
            if (options.broadcastError && isQueue && runner.current() === null)
                throw new Error('队列广播失败');
            if (isQueue && runner.current() === null && listQueue(db).length === 0)
                completed.resolve();
        },
    };
    if (options.mockAi) dependencies.dispatchStep = async () => ({ output: '模拟结果' });
    const runner = new Runner(db, dependencies);
    let yaml =
        'target: https://page.test\ntasks:\n  - name: 流程\n    flow:\n      - ai: 第一步\n      - ai: 第二步';
    if (options.android)
        yaml =
            'android:\n  deviceId: device\ntasks:\n  - name: 设备流程\n    flow:\n      - launch: app.test\n      - ai: 检查应用';
    if (options.click)
        yaml = 'target: https://page.test\ntasks:\n  - name: 点击\n    flow:\n      - aiTap: 按钮';
    if (options.pageGroups)
        yaml += '\n  - name: 第二页\n    url: https://second.test\n    flow:\n      - ai: 新页面';
    const task = insertTask(db, { name: '测试任务', yaml });
    const start = () =>
        runner.start({ taskId: task.id, taskName: '测试任务', yaml, modelId: 'model' });
    return {
        db,
        runner,
        start,
        yaml,
        task,
        completed: completed.promise,
        stepStarted: stepStarted.promise,
        actions,
        pages,
        files,
        resources,
        androidResources,
        cleanupObserved: cleanupObserved.promise,
        diagnosticReceived: diagnosticReceived.promise,
        diagnostics,
    };
}

test('成功运行保存步骤并释放资源', async () => {
    const state = setup({});

    const started = state.start();
    await state.completed;

    expect({
        started,
        current: state.runner.current(),
        statuses: listRunSteps(state.db, 1).map((step) => step.status),
        run: getRun(state.db, 1)?.status,
        actions: state.actions,
        screenshots: state.files.size,
        resources: state.resources,
    }).toEqual({
        started: { queued: false, runId: 1 },
        current: null,
        statuses: ['success', 'success'],
        run: 'success',
        actions: ['第一步', '第二步'],
        screenshots: 4,
        resources: { browserClosed: true, screencastStopped: true, retained: true },
    });
});

test('步骤失败立即停止并保存失败原因', async () => {
    const state = setup({ failAction: true });

    state.start();
    await state.completed;

    expect({
        run: getRun(state.db, 1)?.status,
        error: getRun(state.db, 1)?.error,
        steps: listRunSteps(state.db, 1).map((step) => step.status),
        resources: state.resources,
    }).toEqual({
        run: 'failed',
        error: expect.stringContaining('模型执行失败'),
        steps: ['failed'],
        resources: { browserClosed: true, screencastStopped: true, retained: true },
    });
});

test('手动停止后不执行下一步且释放浏览器', async () => {
    const paused = Promise.withResolvers<void>();
    const state = setup({ pause: paused.promise });

    state.start();
    await state.stepStarted;
    await state.runner.stop();
    paused.resolve();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        actions: state.actions,
        current: state.runner.current(),
        closed: state.resources.browserClosed,
    }).toEqual({ status: 'stopped', actions: ['第一步'], current: null, closed: true });
});

test('浏览器启动失败仍结束运行并清理历史', async () => {
    const state = setup({ failOpen: true });

    state.start();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        error: getRun(state.db, 1)?.error,
        current: state.runner.current(),
        retained: state.resources.retained,
    }).toEqual({ status: 'failed', error: '浏览器启动失败', current: null, retained: true });
});

test('已有运行时进入队列并在上一项结束后顺序执行', async () => {
    const paused = Promise.withResolvers<void>();
    const state = setup({ pause: paused.promise });

    state.start();
    await state.stepStarted;
    const queued = state.start();
    paused.resolve();
    await state.completed;

    expect({
        queued: queued.queued,
        runs: listRuns(state.db, { limit: 10, offset: 0 }).map((run) => run.status),
        actions: state.actions,
    }).toEqual({
        queued: true,
        runs: ['success', 'success'],
        actions: ['第一步', '第二步', '第一步', '第二步'],
    });
});

test('恢复队列会重新执行中断的条目', async () => {
    const state = setup({});
    const item = enqueue(state.db, {
        taskId: state.task.id,
        taskName: '中断任务',
        modelId: 'model',
        model: 'vision',
    });
    setQueueStatus(state.db, item.id, 'running');

    state.runner.resumeQueue();
    await state.completed;

    expect({ pending: listQueue(state.db), status: getRun(state.db, 1)?.status }).toEqual({
        pending: [],
        status: 'success',
    });
});

test('队列里的无效模型会被取消并继续下一项', async () => {
    const state = setup({});
    enqueue(state.db, {
        taskId: state.task.id,
        taskName: '无效',
        modelId: 'missing',
        model: 'missing',
    });
    enqueue(state.db, {
        taskId: state.task.id,
        taskName: '有效',
        modelId: 'model',
        model: 'vision',
    });

    state.runner.resumeQueue();
    await state.completed;

    expect(
        listRuns(state.db, { limit: 10, offset: 0 }).map((run) => ({
            name: run.taskName,
            status: run.status,
        })),
    ).toEqual([{ name: '有效', status: 'success' }]);
});

test('恢复时模型配置读取失败会形成失败记录', async () => {
    const state = setup({ modelsError: '配置损坏' });
    enqueue(state.db, {
        taskId: state.task.id,
        taskName: '中断任务',
        modelId: 'model',
        model: 'vision',
    });

    state.runner.resumeQueue();
    await state.completed;

    expect({
        error: getRun(state.db, 1)?.error,
        status: getRun(state.db, 1)?.status,
        queue: listQueue(state.db),
    }).toEqual({ error: '配置损坏', status: 'failed', queue: [] });
});

test('模型配置损坏时不创建运行记录', () => {
    const state = setup({ modelsError: '配置损坏' });

    expect(state.start).toThrow('配置损坏');
});

test('未检测到浏览器时拒绝网页任务', () => {
    const state = setup({ missingChrome: true });

    expect(state.start).toThrow(ScriptInvalidError);
});

test('空闲时停止保持空闲', async () => {
    const state = setup({});

    await state.runner.stop();

    expect(state.runner.current()).toBeNull();
});

test('预览清理失败不会留下运行中状态', async () => {
    const state = setup({ cleanupError: true });

    state.start();
    await state.completed;

    expect({
        current: state.runner.current(),
        status: getRun(state.db, 1)?.status,
        retained: state.resources.retained,
    }).toEqual({ current: null, status: 'success', retained: true });
});

test('Android运行打开应用并在结束时释放设备与预览', async () => {
    const state = setup({ android: true });

    state.start();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        actions: state.actions,
        device: state.androidResources,
    }).toEqual({
        status: 'success',
        actions: ['启动app.test', '检查应用'],
        device: { connected: true, destroyed: true, previewStopped: true },
    });
});

test.each([{ previewFailure: true }, { previewAbsent: true }])(
    'Android无实时预览仍可完成步骤：%j',
    async (option) => {
        const state = setup({ android: true, ...option });

        state.start();
        await state.completed;

        expect({
            status: getRun(state.db, 1)?.status,
            destroyed: state.androidResources.destroyed,
            screenshots: state.files.size,
        }).toEqual({ status: 'success', destroyed: true, screenshots: 4 });
    },
);

test('离线Android设备不创建运行时且保存失败原因', async () => {
    const state = setup({ android: true, deviceOffline: true });

    state.start();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        error: getRun(state.db, 1)?.error,
        connected: state.androidResources.connected,
    }).toEqual({ status: 'failed', error: '设备离线', connected: false });
});

test('步骤组切换页面会打开新的页面并继续执行', async () => {
    const state = setup({ pageGroups: true });

    state.start();
    await state.completed;

    expect({
        pages: state.pages,
        actions: state.actions,
        status: getRun(state.db, 1)?.status,
    }).toEqual({
        pages: ['https://page.test', 'https://second.test'],
        actions: ['第一步', '第二步', '新页面'],
        status: 'success',
    });
});

test('点击步骤的前后截图均保存定位标记', async () => {
    const state = setup({ click: true });

    state.start();
    await state.completed;

    expect({
        screenshots: [...state.files.values()].map((file) => file.toString().endsWith('标记')),
        status: getRun(state.db, 1)?.status,
    }).toEqual({ screenshots: [true, true], status: 'success' });
});

test('运行和步骤记录累计模型输入输出用量', async () => {
    const state = setup({});

    state.start();
    await state.completed;

    expect({
        input: getRun(state.db, 1)?.tokenInput,
        output: getRun(state.db, 1)?.tokenOutput,
        steps: listRunSteps(state.db, 1).map((step) => [step.tokenInput, step.tokenOutput]),
    }).toEqual({
        input: 20,
        output: 8,
        steps: [
            [10, 4],
            [10, 4],
        ],
    });
});

test.each(['sync', 'async'] as const)(
    '浏览器%s清理失败也释放状态并继续队列',
    async (closeError) => {
        const paused = Promise.withResolvers<void>();
        const state = setup({ pause: paused.promise, closeError });

        state.start();
        await state.stepStarted;
        state.start();
        state.runner.resumeQueue();
        paused.resolve();
        await state.completed;

        expect({
            current: state.runner.current(),
            statuses: listRuns(state.db, { limit: 10, offset: 0 }).map((run) => run.status),
            resources: state.resources,
            diagnostic: state.diagnostics[0],
        }).toEqual({
            current: null,
            statuses: ['success', 'success'],
            resources: { browserClosed: true, screencastStopped: true, retained: true },
            diagnostic: expect.stringContaining('关闭失败'),
        });
    },
);

test('设备清理拒绝也释放运行状态', async () => {
    const state = setup({ android: true, deviceCleanupError: true });

    state.start();
    await state.completed;

    expect({
        current: state.runner.current(),
        device: state.androidResources,
        diagnostic: state.diagnostics[0],
    }).toEqual({
        current: null,
        device: { connected: true, destroyed: true, previewStopped: true },
        diagnostic: '设备清理失败：设备释放失败',
    });
});

test('失败后的截图无法获取时保留失败记录与空截图', async () => {
    const state = setup({ failAction: true, screenshotError: true });

    state.start();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        shotAfter: listRunSteps(state.db, 1)[0].shotAfter,
    }).toEqual({ status: 'failed', shotAfter: null });
});

test('模拟运行不实例化模型Agent也可保存结果', async () => {
    const state = setup({ mockAi: true });

    state.start();
    await state.completed;

    expect({
        status: getRun(state.db, 1)?.status,
        actions: state.actions,
        result: listRunSteps(state.db, 1)[0].aiResult,
    }).toEqual({ status: 'success', actions: [], result: '{"output":"模拟结果"}' });
});

test('历史清理异常释放当前状态并留下诊断', async () => {
    const state = setup({ retentionError: true });

    state.start();
    await state.diagnosticReceived;

    expect({ current: state.runner.current(), diagnostic: state.diagnostics[0] }).toEqual({
        current: null,
        diagnostic: '运行 #1 收尾失败：历史清理失败',
    });
});

test('收尾广播失败仍记录诊断并释放状态', async () => {
    const state = setup({ broadcastError: true });

    state.start();
    await state.diagnosticReceived;

    expect({ current: state.runner.current(), diagnostic: state.diagnostics[0] }).toEqual({
        current: null,
        diagnostic: '运行 #1 收尾失败：队列广播失败',
    });
});

test('历史清理失败也释放状态并继续队列', async () => {
    const paused = Promise.withResolvers<void>();
    const state = setup({ pause: paused.promise, retentionError: true });

    state.start();
    await state.stepStarted;
    state.start();
    state.runner.resumeQueue();
    paused.resolve();
    await state.completed;

    expect({
        current: state.runner.current(),
        statuses: listRuns(state.db, { limit: 10, offset: 0 }).map((run) => run.status),
        resources: state.resources,
        diagnostic: state.diagnostics[0],
    }).toEqual({
        current: null,
        statuses: ['success', 'success'],
        resources: { browserClosed: true, screencastStopped: true, retained: true },
        diagnostic: '运行 #1 收尾失败：历史清理失败',
    });
});

test.each(['cleanupError', 'foregroundError'] as const)(
    '切页时%s不阻止新页面继续执行',
    async (failure) => {
        const state = setup({ pageGroups: true, [failure]: true });

        state.start();
        await state.completed;

        expect({
            pages: state.pages,
            actions: state.actions,
            status: getRun(state.db, 1)?.status,
        }).toEqual({
            pages: ['https://page.test', 'https://second.test'],
            actions: ['第一步', '第二步', '新页面'],
            status: 'success',
        });
    },
);
