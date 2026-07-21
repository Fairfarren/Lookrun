import path from "node:path";
import { createBunWebSocket } from "hono/bun";
import { Hono } from "hono";
import { SERVER_PORT } from "./config";
import { ensurePortFree } from "./port";
import { registerRoutes } from "./routes";
import { registerStatic } from "./static";
import { addWsClient, removeWsClient } from "./ws";

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

app.get("/api/health", (c) => c.json({ ok: true }));

registerRoutes(app);

// /ws 必须注册在静态资源的通配路由之前，否则会被 * 抢先匹配
app.get(
	"/ws",
	upgradeWebSocket(() => ({
		onOpen(_event, ws) {
			addWsClient(ws);
		},
		onClose(_event, ws) {
			removeWsClient(ws);
		},
	})),
);

registerStatic(app);

// 打包形态（可执行文件）下启动后自动打开浏览器
function isPackaged() {
	return !path.basename(process.execPath).toLowerCase().startsWith("bun");
}

function openBrowser(url: string) {
	const command =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", url]
				: ["xdg-open", url];
	Bun.spawn({ cmd: command, stdout: "ignore", stderr: "ignore" });
}

// 启动前确保端口空闲：被占用则自动杀掉占用进程（通常是上次未退出的残留实例）
ensurePortFree(SERVER_PORT);

Bun.serve({ port: SERVER_PORT, fetch: app.fetch, websocket });
console.log(`AI 自动化测试服务已启动：http://localhost:${SERVER_PORT}`);

if (isPackaged()) {
	openBrowser(`http://localhost:${SERVER_PORT}`);
}
