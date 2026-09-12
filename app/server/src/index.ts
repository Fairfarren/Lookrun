import path from 'node:path';
import { createBunWebSocket } from 'hono/bun';
import { Hono } from 'hono';
import { SERVER_PORT } from './config';
import { browserOpenCommand } from './lib/open-browser';
import { ensurePortFree } from './lib/port';
import { registerRoutes } from './routes';
import { configureBundledRuntimeAssets } from './lib/runtime-assets';
import { registerStatic } from './lib/static';
import { addWsClient, removeWsClient } from './lib/ws';

// 打包产物才加载编译期生成的内嵌资源；开发态由 Vite 提供前端页面
function isPackaged() {
    return !path.basename(process.execPath).toLowerCase().startsWith('bun');
}

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

configureBundledRuntimeAssets();

app.get('/api/health', (c) => c.json({ ok: true }));

registerRoutes(app);

// /ws 必须注册在静态资源的通配路由之前，否则会被 * 抢先匹配
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

const embeddedAssets = isPackaged() ? (await import('./gen/assets')).embeddedAssets : {};
registerStatic(app, embeddedAssets);

function openBrowser(url: string) {
    Bun.spawn({
        cmd: browserOpenCommand(process.platform, url),
        stdout: 'ignore',
        stderr: 'ignore',
    });
}

// 启动前确保端口空闲：被占用则自动杀掉占用进程（通常是上次未退出的残留实例）
ensurePortFree(SERVER_PORT);

Bun.serve({ port: SERVER_PORT, fetch: app.fetch, websocket });
console.log(`AI 自动化测试服务已启动：http://localhost:${SERVER_PORT}`);

if (isPackaged()) {
    openBrowser(`http://localhost:${SERVER_PORT}`);
}
