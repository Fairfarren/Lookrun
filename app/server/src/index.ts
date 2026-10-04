import path from 'node:path';
import { createBunWebSocket } from 'hono/bun';
import { Hono } from 'hono';
import { SERVER_PORT } from './config';
import { browserOpenCommand } from './lib/open-browser';
import { ensurePortFree } from './lib/port';
import { installProcessErrorHandlers } from './lib/process-errors';
import { registerRoutes } from './routes';
import { configureBundledRuntimeAssets } from './lib/runtime-assets';
import { registerStatic } from './lib/static';
import { addWsClient, removeWsClient } from './lib/ws';

const serverIO = {
    process,
    createBunWebSocket,
    installProcessErrorHandlers,
    configureBundledRuntimeAssets,
    registerRoutes,
    registerStatic,
    ensurePortFree,
    serve: Bun.serve,
    spawn: Bun.spawn,
    log: console.log,
};

export async function startApplication(
    input: {
        main: boolean;
        execPath: string;
        platform: NodeJS.Platform;
        port: number;
        openBrowser?: boolean;
    },
    dependencies?: Partial<typeof serverIO>,
) {
    if (!input.main) return;
    const io = { ...serverIO, ...dependencies };
    io.installProcessErrorHandlers(io.process);
    io.configureBundledRuntimeAssets();
    const app = new Hono();
    const { upgradeWebSocket, websocket } = io.createBunWebSocket();
    app.get('/api/health', (c) => c.json({ ok: true }));
    io.registerRoutes(app);
    // WebSocket 路由先于静态通配路由，避免握手请求被页面资源处理。
    app.get(
        '/ws',
        upgradeWebSocket(() => ({
            onOpen(_event, ws) {
                addWsClient(ws);
            },
            onClose(_event, ws) {
                removeWsClient(ws);
            },
        })),
    );
    const packaged = !path.basename(input.execPath).toLowerCase().startsWith('bun');
    const assets = packaged ? (await import('./gen/assets')).embeddedAssets : {};
    io.registerStatic(app, assets);
    // 端口零由操作系统分配，不查询或终止其它监听进程。
    if (input.port !== 0) io.ensurePortFree(input.port);
    const server = io.serve({ port: input.port, fetch: app.fetch, websocket });
    const url = `http://localhost:${server.port}`;
    io.log(`AI 自动化测试服务已启动：${url}`);
    if (packaged && input.openBrowser !== false) {
        io.spawn({
            cmd: browserOpenCommand(input.platform, url),
            stdout: 'ignore',
            stderr: 'ignore',
        });
    }
    return { app, server };
}

await startApplication({
    main: import.meta.main,
    execPath: process.execPath,
    platform: process.platform,
    port: SERVER_PORT,
    openBrowser: process.env.LOOKRUN_OPEN_BROWSER !== '0',
});
