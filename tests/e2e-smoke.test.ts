import { expect, test } from 'bun:test';
import {
    checkFailure,
    checkSuccess,
    eventCounts,
    observeSocket,
    runE2e,
    taskYaml,
} from '../scripts/e2e-smoke';
import { runDetail, smokeFixture } from './helpers/smoke-fixture';

test('完整冒烟成功后关闭所有隔离资源', async () => {
    const { io, state } = smokeFixture();

    await runE2e(io);

    expect({
        directory: state.directoryExists,
        fixture: state.fixtureOpen,
        process: state.childAlive,
        socket: state.socketClosed,
    }).toEqual({ directory: false, fixture: false, process: false, socket: true });
});

test('冒烟任务失败时仍关闭全部隔离资源', async () => {
    const { io, state } = smokeFixture();
    state.failurePath = '/api/tasks';

    await runE2e(io).catch(() => {});

    expect({
        directory: state.directoryExists,
        fixture: state.fixtureOpen,
        process: state.childAlive,
        socket: state.socketClosed,
    }).toEqual({ directory: false, fixture: false, process: false, socket: true });
});

test('冒烟通过系统分配端口并隔离模型配置', async () => {
    const { io, state } = smokeFixture();

    await runE2e(io);

    expect(state.lastEnvironment.SERVER_PORT).toBe('0');
});

test('模型配置写入失败仍清理页面和目录', async () => {
    const { io, state } = smokeFixture();
    io.write = (async () => {
        throw new Error('无法写入');
    }) as typeof io.write;

    await runE2e(io).catch(() => {});

    expect({ directory: state.directoryExists, fixture: state.fixtureOpen }).toEqual({
        directory: false,
        fixture: false,
    });
});

test('停止场景有充足的可中断步骤', () => {
    const yaml = taskYaml('http://127.0.0.1:40000/', true);

    expect(yaml).toContain('sleep: 30000');
});

test('成功结果缺截图时拒绝通过', () => {
    const detail = runDetail('success', 'http://local/');
    detail.steps[0]!.shotAfter = null;

    expect(() => checkSuccess(detail, 'http://local/')).toThrow('缺少执行后截图');
});

test('失败场景执行后续步骤时拒绝通过', () => {
    const detail = runDetail('success', 'http://local/');
    detail.run.status = 'failed';

    expect(() => checkFailure(detail)).toThrow('失败后仍执行了后续步骤');
});

test('实时消息格式错误不会静默忽略', () => {
    const socket = {} as WebSocket;
    const state = observeSocket(socket);

    socket.onmessage!.call(socket, new MessageEvent('message', { data: 'invalid' }));

    expect(() => eventCounts(state)).toThrow('WebSocket 收到错误消息');
});

test('实时连接错误会让检查失败', () => {
    const socket = {} as WebSocket;
    const state = observeSocket(socket);

    socket.onerror!.call(socket, new Event('error'));

    expect(() => eventCounts(state)).toThrow('WebSocket 收到错误消息');
});

test('源码冒烟命令只在全部场景通过后报告成功', async () => {
    const { runE2eCli } = await import('../scripts/e2e-smoke');
    const { io } = smokeFixture();
    let output = '';

    await runE2eCli(
        {
            main: true,
            log: (message) => {
                output = message;
            },
        },
        io,
    );

    expect(output).toBe('E2E_SMOKE_PASS');
});
