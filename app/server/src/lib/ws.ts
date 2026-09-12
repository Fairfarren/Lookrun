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

export function trySendWs(ws: { send: (text: string) => void }, text: string) {
    try {
        ws.send(text);
        return true;
    } catch {
        return false;
    }
}

export function sendJsonToClients(
    clients: Set<{ send: (text: string) => void }>,
    payload: unknown,
) {
    const text = JSON.stringify(payload);
    const snapshot = Array.from(clients);
    for (const ws of snapshot) {
        if (!trySendWs(ws, text)) {
            clients.delete(ws);
        }
    }
}

export function broadcast(payload: unknown) {
    sendJsonToClients(wsClients, payload);
}
