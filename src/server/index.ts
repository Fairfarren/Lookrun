import { createBunWebSocket } from 'hono/bun';
import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { SERVER_PORT } from './config';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// 实时画面与运行事件的 WebSocket 客户端集合，由执行引擎广播
export const wsClients = new Set<WSContext>();

export function broadcast(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const ws of wsClients) {
    try {
      ws.send(text);
    } catch {
      wsClients.delete(ws);
    }
  }
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      wsClients.add(ws);
    },
    onClose(_event, ws) {
      wsClients.delete(ws);
    },
  })),
);

export default {
  port: SERVER_PORT,
  fetch: app.fetch,
  websocket,
};
