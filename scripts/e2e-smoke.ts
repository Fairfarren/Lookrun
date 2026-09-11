// E2E 冒烟：MOCK_AI 模式下完整跑一个任务，验证运行链路（含手动停止与失败即停场景）
import { spawn, type Subprocess } from 'bun';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = '/tmp/twai-e2e';

interface RunBody {
    status: string;
    error?: string | null;
}

interface StepBody {
    stepIndex: number;
    status: string;
    shotBefore?: string | null;
    shotAfter?: string | null;
    url?: string | null;
}

interface RunDetailBody {
    run: RunBody;
    steps: StepBody[];
}

async function api<T>(path: string, options?: RequestInit) {
    const res = await fetch(`${BASE}${path}`, options);
    return { status: res.status, body: (await res.json()) as T };
}

async function waitForServer() {
    for (let i = 0; i < 30; i++) {
        try {
            await fetch(`${BASE}/api/health`);
            return;
        } catch {
            await Bun.sleep(300);
        }
    }
    throw new Error('服务启动超时');
}

async function waitForRunFinish(runId: number) {
    for (let i = 0; i < 60; i++) {
        const { body } = await api<RunDetailBody>(`/api/runs/${runId}`);
        if (body.run.status !== 'running') {
            return body;
        }
        await Bun.sleep(500);
    }
    throw new Error('运行结束超时');
}

function connectWs(events: unknown[]) {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    ws.onmessage = (event) => {
        try {
            events.push(JSON.parse(String(event.data)));
        } catch {
            // 忽略非 JSON 帧
        }
    };
    return ws;
}

async function startServer(env: Record<string, string>): Promise<Subprocess> {
    const server = spawn({
        cmd: ['bun', 'packages/server/src/index.ts'],
        env: {
            ...process.env,
            MOCK_AI: '1',
            TEST_WEB_AI_DATA_DIR: DATA_DIR,
            SERVER_PORT: String(PORT),
            ...env,
        },
        stdout: 'ignore',
        stderr: 'pipe',
    });
    await waitForServer();
    return server;
}

async function stopServer(server: Subprocess) {
    server.kill();
    await server.exited;
}

async function createTaskAndGetId() {
    const yaml = `target: https://example.com
tasks:
  - name: 第一步组
    flow:
      - ai: 检查页面标题
      - aiTap: More information 链接
  - name: 第二步组
    flow:
      - aiAssert: 页面加载完成
      - sleep: 200
`;
    const { status, body } = await api<{ id: number }>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'E2E 示例任务', yaml }),
    });
    if (status !== 201) throw new Error(`创建任务失败：${JSON.stringify(body)}`);
    return body.id;
}

async function main() {
    await Bun.$`rm -rf ${DATA_DIR}`;
    const events: unknown[] = [];

    // 场景一：完整跑通
    let server = await startServer({});
    const ws = connectWs(events);
    const taskId = await createTaskAndGetId();
    const started = await api<{ runId: number }>('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, modelId: 'kimi-k2.7-code' }),
    });
    if (started.status !== 200) throw new Error(`启动运行失败：${JSON.stringify(started.body)}`);

    const detail = await waitForRunFinish(started.body.runId);
    console.log('== 场景一：完整跑通 ==');
    console.log('运行状态:', detail.run.status, '| 步骤数:', detail.steps.length);
    if (detail.run.status !== 'success') throw new Error(`运行未成功：${detail.run.error}`);
    if (detail.steps.length !== 4) throw new Error('步骤数不对');
    for (const step of detail.steps) {
        if (step.status !== 'success') throw new Error(`步骤 ${step.stepIndex} 未成功`);
        if (!step.shotBefore || !step.shotAfter) throw new Error(`步骤 ${step.stepIndex} 缺截图`);
        if (!step.url?.includes('example.com')) throw new Error(`步骤 ${step.stepIndex} 缺 URL`);
    }
    const shot = await fetch(`${BASE}/api/screenshots/${detail.steps[0].shotBefore}`);
    if (!shot.ok) throw new Error('截图接口不可访问');

    await Bun.sleep(500);
    const frameEvents = events.filter((e) => (e as { type: string }).type === 'frame');
    const stepEvents = events.filter((e) => (e as { type: string }).type === 'step');
    console.log('WS 事件: frame', frameEvents.length, '个 | step', stepEvents.length, '个');
    if (frameEvents.length === 0) throw new Error('没有收到实时画面帧');
    if (stepEvents.length !== 4) throw new Error('步骤事件数不对');
    ws.close();

    // 场景二：运行中手动停止
    console.log('== 场景二：手动停止 ==');
    const ws2 = connectWs([]);
    const started2 = await api<{ runId: number }>('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, modelId: 'kimi-k2.7-code' }),
    });
    await Bun.sleep(800);
    await api('/api/runs/current/stop', { method: 'POST' });
    const detail2 = await waitForRunFinish(started2.body.runId);
    console.log('停止后运行状态:', detail2.run.status);
    if (detail2.run.status !== 'stopped')
        throw new Error(`停止后状态应为 stopped，实际 ${detail2.run.status}`);
    ws2.close();
    await stopServer(server);

    // 场景三：MOCK_FAIL_AT=2 验证失败即停
    console.log('== 场景三：失败即停 ==');
    server = await startServer({ MOCK_FAIL_AT: '2' });
    const started3 = await api<{ runId: number }>('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, modelId: 'kimi-k2.7-code' }),
    });
    const detail3 = await waitForRunFinish(started3.body.runId);
    console.log('失败运行状态:', detail3.run.status, '| 已完成步骤数:', detail3.steps.length);
    if (detail3.run.status !== 'failed') throw new Error('应为 failed');
    if (detail3.steps.length !== 3)
        throw new Error(`失败即停后应只有 3 步记录，实际 ${detail3.steps.length}`);
    if (detail3.steps[2].status !== 'failed') throw new Error('第 3 步应为 failed');
    if (!detail3.run.error?.includes('第 3 步'))
        throw new Error(`错误信息应指出失败步骤：${detail3.run.error}`);
    await stopServer(server);

    console.log('E2E_SMOKE_PASS');
}

await main();
