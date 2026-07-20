import { createBunWebSocket } from 'hono/bun';
import { Hono } from 'hono';
import { SERVER_PORT } from './config';
import { registerRoutes } from './routes';
import { addWsClient, removeWsClient } from './ws';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

app.get('/api/health', (c) => c.json({ ok: true }));

registerRoutes(app);

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

export default {
  port: SERVER_PORT,
  fetch: app.fetch,
  websocket,
};
