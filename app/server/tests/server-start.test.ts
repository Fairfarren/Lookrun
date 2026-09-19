import { expect, test } from 'bun:test';
import { startApplication } from '../src/index';
import { hasWsClients } from '../src/lib/ws';
import type { WSContext, WSEvents } from 'hono/ws';

type Io = NonNullable<Parameters<typeof startApplication>[1]>;
function setup() {
    const effects: {
        ensured: number[];
        opened: string[][];
        logs: string[];
        configured: boolean;
        handlers: boolean;
    } = { ensured: [], opened: [], logs: [], configured: false, handlers: false };
    let wsEvents: WSEvents;
    const io: Io = {
        installProcessErrorHandlers: () => {
            effects.handlers = true;
        },
        configureBundledRuntimeAssets: () => {
            effects.configured = true;
            return { ffmpegPath: null, scrcpyServerPath: null };
        },
        registerRoutes: (app) => {
            app.get('/api/test', (c) => c.json({ test: true }));
        },
        createBunWebSocket: (() => ({
            websocket: {},
            upgradeWebSocket: (factory: () => WSEvents) => {
                wsEvents = factory();
                return (c: { text: (text: string) => Response }) => c.text('握手');
            },
        })) as unknown as Io['createBunWebSocket'],
        ensurePortFree: (port) => {
            effects.ensured.push(port);
        },
        serve: (() => ({ port: 45678 })) as unknown as Io['serve'],
        spawn: ((options: { cmd: string[] }) => {
            effects.opened.push(options.cmd);
            return {};
        }) as unknown as Io['spawn'],
        log: (message) => {
            effects.logs.push(message);
        },
    };
    return { io, effects, wsEvents: () => wsEvents };
}

test('导入入口不启动服务', async () => {
    const state = setup();

    const result = await startApplication(
        { main: false, execPath: '/bin/bun', platform: 'linux', port: 0 },
        state.io,
    );

    expect({ result, effects: state.effects }).toEqual({
        result: undefined,
        effects: { ensured: [], opened: [], logs: [], configured: false, handlers: false },
    });
});

test('随机端口启动返回实际地址且健康检查可用', async () => {
    const state = setup();

    const result = await startApplication(
        { main: true, execPath: '/bin/bun', platform: 'linux', port: 0 },
        state.io,
    );
    const health = await result!.app.request('/api/health');
    const missing = await result!.app.request('/missing.css');

    expect({
        health: await health.json(),
        status: health.status,
        missing: missing.status,
        effects: state.effects,
    }).toEqual({
        health: { ok: true },
        status: 200,
        missing: 404,
        effects: {
            ensured: [],
            opened: [],
            logs: ['AI 自动化测试服务已启动：http://localhost:45678'],
            configured: true,
            handlers: true,
        },
    });
});

test('打包启动使用实际端口打开浏览器并初始化固定端口', async () => {
    const state = setup();

    await startApplication(
        { main: true, execPath: '/app/lookrun', platform: 'darwin', port: 3877 },
        state.io,
    );

    expect({ ensured: state.effects.ensured, opened: state.effects.opened }).toEqual({
        ensured: [3877],
        opened: [['open', 'http://localhost:45678']],
    });
});

test('WebSocket握手不会被静态路由抢占且连接生命周期可见', async () => {
    const state = setup();
    const result = await startApplication(
        { main: true, execPath: '/bin/bun', platform: 'linux', port: 0 },
        state.io,
    );
    const ws = {} as WSContext;

    const response = await result!.app.request('/ws');
    state.wsEvents().onOpen!(new Event('open'), ws);
    const connected = hasWsClients();
    state.wsEvents().onClose!(new CloseEvent('close'), ws);

    expect({ text: await response.text(), connected, disconnected: hasWsClients() }).toEqual({
        text: '握手',
        connected: true,
        disconnected: false,
    });
});

test('禁用自动打开浏览器时打包服务正常启动', async () => {
    const state = setup();

    const result = await startApplication(
        { main: true, execPath: '/app/lookrun', platform: 'darwin', port: 0, openBrowser: false },
        state.io,
    );

    expect({ port: result!.server.port, opened: state.effects.opened }).toEqual({
        port: 45678,
        opened: [],
    });
});
