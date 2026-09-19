import { expect, test } from 'bun:test';
import {
    captureOutput,
    pollUntil,
    serviceReady,
    smokeRequest,
    startedServer,
    stopServer,
    withServer,
    withTempDirectory,
} from '../scripts/smoke-common';
import { smokeFixture } from './helpers/smoke-fixture';

test('轮询按状态完成并返回最后结果', async () => {
    const { io, state } = smokeFixture();

    const result = await pollUntil(
        {
            label: '状态',
            timeoutMs: 200,
            read: async () => state.now,
            done: (value) => value >= 100,
        },
        io,
    );

    expect(result).toBe(100);
});

test('轮询超时包含任务上下文', async () => {
    const { io } = smokeFixture();

    const result = pollUntil(
        { label: '运行完成', timeoutMs: 100, read: async () => false, done: Boolean },
        io,
    );

    await expect(result).rejects.toThrow('运行完成超时');
});

test('请求状态错误立即失败', async () => {
    const { client } = smokeFixture();

    const result = smokeRequest(client, { pathname: '/missing', method: 'GET', status: 200 });

    await expect(result).rejects.toThrow('GET /missing 状态错误');
});

test('健康请求连接失败时报告未就绪', async () => {
    const { client, state } = smokeFixture();
    state.failurePath = '/api/health';

    const result = await serviceReady(client);

    expect(result).toBe(false);
});

test('服务输出支持跨块解析端口', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('AI 自动化测试服务已启动：'));
            controller.enqueue(encoder.encode('http://localhost:42345\n'));
            controller.close();
        },
    });

    const output = captureOutput(stream);
    await output.finished;

    expect(startedServer(output.output)).toBe('42345');
});

test('服务输出读取失败会拒绝就绪', async () => {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.error(new Error('流中断'));
        },
    });

    const output = captureOutput(stream);
    await output.finished;

    expect(() => startedServer(output.output)).toThrow('读取服务输出失败');
});

test.each(['\n', '\r\n'])('端口数字分块时等到完整启动行再请求服务（%j）', async (ending) => {
    const { io } = smokeFixture();
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stdout = new ReadableStream<Uint8Array>({
        start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode('AI 自动化测试服务已启动：http://localhost:431'));
        },
    });
    const originalSpawn = io.spawn;
    io.spawn = ((options: Parameters<typeof io.spawn>[0]) => ({
        ...originalSpawn(options),
        stdout,
    })) as unknown as typeof io.spawn;
    let ticks = 0;
    const originalSleep = io.sleep;
    io.sleep = (async () => {
        ticks += 1;
        if (ticks === 2) {
            streamController.enqueue(encoder.encode(`11${ending}`));
            streamController.close();
        }
        await originalSleep(0);
    }) as typeof io.sleep;
    const originalFetch = io.fetch;
    io.fetch = (async (url: URL, options: RequestInit) => {
        if (url.port !== '43111') throw new Error('请求了尚未读完整的端口');
        return originalFetch(url, options);
    }) as typeof io.fetch;

    const result = await withServer(
        {
            command: ['stub'],
            cwd: '/tmp',
            dataDir: '/tmp/data',
            failAt: -1,
            check: async (client) => client.base,
        },
        io,
    );

    expect(result).toBe('http://127.0.0.1:43111');
});

test('清理接口失败仍结束子进程', async () => {
    const { client, state } = smokeFixture();
    state.failurePath = '/api/runs/current/stop';
    let alive = true;
    const child = {
        kill: () => {
            alive = false;
            return true;
        },
        exited: Promise.resolve(0),
    };

    await stopServer({ child, ready: true }, client).catch(() => {});

    expect(alive).toBe(false);
});

test('服务检查失败仍关闭子进程', async () => {
    const { io, state } = smokeFixture();

    await withServer(
        {
            command: ['stub'],
            cwd: '/tmp',
            dataDir: '/tmp/data',
            failAt: -1,
            check: async () => {
                throw new Error('检查失败');
            },
        },
        io,
    ).catch(() => {});

    expect(state.childAlive).toBe(false);
});

test('服务启动前退出不会等待健康轮询到超时', async () => {
    const { io, state } = smokeFixture();
    state.startupExit = 1;

    const result = withServer(
        {
            command: ['stub'],
            cwd: '/tmp',
            dataDir: '/tmp/data',
            failAt: -1,
            check: async () => '未执行',
        },
        io,
    );

    await expect(result).rejects.toThrow('服务在就绪前退出');
});

test('服务启动后的健康检查不能接受错误响应', async () => {
    const { io, state } = smokeFixture();
    state.healthStatus = 500;

    const result = withServer(
        {
            command: ['stub'],
            cwd: '/tmp',
            dataDir: '/tmp/data',
            failAt: -1,
            check: async () => '未执行',
        },
        io,
    );

    await expect(result).rejects.toThrow('健康检查失败');
});

test('临时目录中的检查失败也会清理目录', async () => {
    const { io, state } = smokeFixture();

    await withTempDirectory(async () => {
        throw new Error('检查失败');
    }, io).catch(() => {});

    expect(state.directoryExists).toBe(false);
});
