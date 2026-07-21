import { useEffect, useRef } from 'react';
import type { RunRecord, RunStepRecord } from '../../shared/types';
import type { QueueItem } from './api';

export type WsMessage =
  | { type: 'frame'; data: string }
  | { type: 'run'; run: RunRecord }
  | { type: 'step'; step: RunStepRecord }
  | { type: 'step-start'; runId: number; stepIndex: number; stepName: string; action: string; totalSteps: number }
  | { type: 'queue'; items: QueueItem[] };

const RECONNECT_DELAY_MS = 2000;

// 连接后端 WebSocket，断线自动重连；消息通过 onMessage 回调分发
export function useWebSocket(onMessage: (message: WsMessage) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${protocol}://${location.host}/ws`);
      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(String(event.data)));
        } catch {
          // 忽略无法解析的消息
        }
      };
      ws.onclose = () => {
        if (!disposed) {
          retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);
}
