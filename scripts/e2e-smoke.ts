import { strict as assert } from 'node:assert';
import path from 'node:path';
import {
    pollUntil,
    smokeIo,
    smokeRequest,
    waitForIdle,
    withServer,
    withTempDirectory,
    type SmokeClient,
    type SmokeIo,
} from './smoke-common';

const RUN_TIMEOUT_MS = 45_000;
const EXPECTED_STEP_COUNT = 4;
const FIXTURE_HTML =
    '<!doctype html><html><title>本地冒烟页面</title><body><h1>本地冒烟页面</h1><button>继续</button></body></html>';

export type RunDetail = {
    run: { status: string; error: string | null };
    steps: Array<{
        stepIndex: number;
        status: string;
        shotBefore: string | null;
        shotAfter: string | null;
        url: string | null;
    }>;
};

export function taskYaml(fixtureUrl: string, stopping: boolean) {
    const lastStep = stopping ? 'sleep: 30000' : 'aiAssert: 页面显示本地冒烟页面';
    return `target: ${fixtureUrl}\ntasks:\n  - name: 本地冒烟\n    flow:\n      - aiTap: 继续\n      - ${lastStep}\n      - aiAssert: 页面显示继续按钮\n      - aiTap: 继续\n`;
}

export async function startRun(client: SmokeClient, yaml: string) {
    const created = await smokeRequest(client, {
        pathname: '/api/tasks',
        method: 'POST',
        status: 201,
        body: { name: '隔离冒烟任务', yaml },
    });
    const task = (await created.json()) as { id: number };
    const started = await smokeRequest(client, {
        pathname: '/api/runs',
        method: 'POST',
        status: 200,
        body: { taskId: task.id, modelId: 'smoke-model' },
    });
    const run = (await started.json()) as { runId: number; queued?: boolean };
    assert.equal(run.queued, false, '冒烟任务不应排队');
    assert.ok(Number.isInteger(run.runId), '启动响应缺少运行编号');
    return run.runId;
}

export async function readRun(client: SmokeClient, runId: number): Promise<RunDetail> {
    const response = await smokeRequest(client, {
        pathname: `/api/runs/${runId}`,
        method: 'GET',
        status: 200,
    });
    return response.json() as Promise<RunDetail>;
}

export async function waitForRun(client: SmokeClient, runId: number) {
    return pollUntil(
        {
            label: `等待运行 #${runId} 完成`,
            timeoutMs: RUN_TIMEOUT_MS,
            read: () => readRun(client, runId),
            done: (detail) => detail.run.status !== 'running',
        },
        client.io,
    );
}

export function checkSuccess(detail: RunDetail, fixtureUrl: string) {
    assert.equal(detail.run.status, 'success', `任务未成功：${detail.run.error}`);
    assert.equal(detail.steps.length, EXPECTED_STEP_COUNT, '成功场景必须完成全部四步');
    for (const step of detail.steps) {
        assert.equal(step.status, 'success', `步骤 ${step.stepIndex} 失败`);
        assert.ok(step.shotBefore, `步骤 ${step.stepIndex} 缺少执行前截图`);
        assert.ok(step.shotAfter, `步骤 ${step.stepIndex} 缺少执行后截图`);
        assert.equal(step.url, fixtureUrl, '步骤没有使用本地页面');
    }
}

export function checkFailure(detail: RunDetail) {
    assert.equal(detail.run.status, 'failed', '故障场景必须失败');
    assert.deepEqual(
        detail.steps.map((step) => step.status),
        ['success', 'success', 'failed'],
        '失败后仍执行了后续步骤',
    );
    assert.match(String(detail.run.error), /第 3 步/, '错误未指出失败位置');
}

export function observeSocket(socket: WebSocket) {
    const state = { events: [] as Array<{ type: string }>, error: null as unknown };
    socket.onmessage = (event) => {
        try {
            const value = JSON.parse(String(event.data)) as { type: string };
            assert.equal(typeof value.type, 'string', 'WebSocket 消息缺少类型');
            state.events.push(value);
        } catch (error) {
            state.error = error;
        }
    };
    socket.onerror = () => {
        state.error = new Error('WebSocket 连接失败');
    };
    return state;
}

export function eventCounts(state: ReturnType<typeof observeSocket>) {
    assert.equal(state.error, null, 'WebSocket 收到错误消息');
    return {
        frames: state.events.filter((event) => event.type === 'frame').length,
        steps: state.events.filter((event) => event.type === 'step').length,
    };
}

export async function successfulScenario(client: SmokeClient, fixtureUrl: string) {
    const socket = new client.io.WebSocket(client.base.replace('http:', 'ws:') + '/ws');
    const observed = observeSocket(socket);
    try {
        await pollUntil(
            {
                label: '等待实时连接',
                timeoutMs: RUN_TIMEOUT_MS,
                read: async () => {
                    eventCounts(observed);
                    return socket.readyState;
                },
                done: (state) => state === WebSocket.OPEN,
            },
            client.io,
        );
        const runId = await startRun(client, taskYaml(fixtureUrl, false));
        const detail = await waitForRun(client, runId);
        checkSuccess(detail, fixtureUrl);
        const screenshot = await smokeRequest(client, {
            pathname: `/api/screenshots/${detail.steps[0]!.shotBefore}`,
            method: 'GET',
            status: 200,
        });
        assert.ok((await screenshot.arrayBuffer()).byteLength > 0, '截图内容为空');
        const counts = await pollUntil(
            {
                label: '等待实时事件',
                timeoutMs: RUN_TIMEOUT_MS,
                read: async () => eventCounts(observed),
                done: (value) => value.frames > 0 && value.steps >= EXPECTED_STEP_COUNT,
            },
            client.io,
        );
        assert.equal(counts.steps, EXPECTED_STEP_COUNT, '步骤事件数量错误');
    } finally {
        socket.close();
    }
    await waitForIdle(client);
}

export async function stoppedScenario(client: SmokeClient, fixtureUrl: string) {
    const runId = await startRun(client, taskYaml(fixtureUrl, true));
    await pollUntil(
        {
            label: '等待第一步完成',
            timeoutMs: RUN_TIMEOUT_MS,
            read: () => readRun(client, runId),
            done: (detail) => detail.steps.length > 0,
        },
        client.io,
    );
    await smokeRequest(client, { pathname: '/api/runs/current/stop', method: 'POST', status: 200 });
    const detail = await waitForRun(client, runId);
    assert.equal(detail.run.status, 'stopped', '手动停止后状态错误');
    assert.ok(detail.steps.length < EXPECTED_STEP_COUNT, '停止后仍执行了全部步骤');
    await waitForIdle(client);
}

export async function failedScenario(client: SmokeClient, fixtureUrl: string) {
    const runId = await startRun(client, taskYaml(fixtureUrl, false));
    checkFailure(await waitForRun(client, runId));
    await waitForIdle(client);
}

export async function runE2e(io: SmokeIo) {
    return withTempDirectory(async (dataDir) => {
        const fixture = io.serve({
            hostname: '127.0.0.1',
            port: 0,
            routes: {
                '/': new Response(FIXTURE_HTML, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                }),
            },
        });
        try {
            await io.write(
                path.join(dataDir, 'models.json'),
                JSON.stringify({
                    baseUrl: 'http://127.0.0.1:1',
                    apiKey: 'smoke-only',
                    models: [
                        {
                            id: 'smoke-model',
                            name: '冒烟模型',
                            model: 'smoke-model',
                            family: 'qwen3',
                        },
                    ],
                }),
            );
            const fixtureUrl = `http://127.0.0.1:${fixture.port}/`;
            const options = {
                command: [process.execPath, 'app/server/src/index.ts'],
                cwd: process.cwd(),
                dataDir,
            };
            await withServer(
                {
                    ...options,
                    failAt: -1,
                    check: async (client) => {
                        await successfulScenario(client, fixtureUrl);
                        await stoppedScenario(client, fixtureUrl);
                    },
                },
                io,
            );
            await withServer(
                { ...options, failAt: 2, check: (client) => failedScenario(client, fixtureUrl) },
                io,
            );
        } finally {
            await fixture.stop(true);
        }
    }, io);
}

export async function runE2eCli(
    input: { main: boolean; log: (message: string) => void },
    io: SmokeIo,
) {
    if (!input.main) return;
    await runE2e(io);
    input.log('E2E_SMOKE_PASS');
}

await runE2eCli({ main: import.meta.main, log: console.log }, smokeIo);
