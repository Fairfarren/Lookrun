import type { WSContext } from 'hono/ws';

// 实时画面与运行事件的 WebSocket 客户端集合，由执行引擎广播
const wsClients = new Set<WSContext>();

export function addWsClient(ws: WSContext) {
  wsClients.add(ws);
}

export function removeWsClient(ws: WSContext) {
  wsClients.delete(ws);
}

export function hasWsClients() {
  return wsClients.size > 0;
}

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
