import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { WSContext } from 'hono/ws';
import type { Page } from 'puppeteer-core';
import { addWsClient, removeWsClient, hasWsClients, broadcast } from '../src/lib/ws';
import { installProcessErrorHandlers } from '../src/lib/process-errors';
import { startScreencast } from '../src/services/screencast';

function client(messages: unknown[]) {
    return { send: (text: string) => messages.push(JSON.parse(text)) } as unknown as WSContext;
}

test('WebSocket连接生命周期和广播反映实际客户端状态', () => {
    const messages: unknown[] = [];
    const ws = client(messages);
    addWsClient(ws);
    try {
        broadcast({ type: 'run', id: 1 });
        expect({ connected: hasWsClients(), messages }).toEqual({
            connected: true,
            messages: [{ type: 'run', id: 1 }],
        });
    } finally {
        removeWsClient(ws);
    }
});

test('移除最后一个WebSocket连接后不再报告有观众', () => {
    const ws = client([]);
    addWsClient(ws);

    removeWsClient(ws);

    expect(hasWsClients()).toBe(false);
});

test('进程错误处理器安装后输出事件分类与错误上下文', () => {
    const target = new EventEmitter();
    const lines: string[] = [];
    installProcessErrorHandlers(target as unknown as NodeJS.Process, (line) => {
        lines.push(line);
    });

    target.emit('unhandledRejection', new Error('连接失败'));
    target.emit('uncaughtException', '未知异常');

    expect(lines).toEqual(['未处理的 Promise 拒绝：连接失败', '未捕获异常：未知异常']);
});

test('CDP画面发送给WebSocket并确认帧，停止失败也能安全结束', async () => {
    const messages: unknown[] = [];
    const ws = client(messages);
    const emitter = new EventEmitter();
    const commands: string[] = [];
    const cdp = Object.assign(emitter, {
        send: async (command: string) => {
            commands.push(command);
            if (command === 'Page.screencastFrameAck' || command === 'Page.stopScreencast')
                throw new Error('会话已关闭');
        },
    });
    addWsClient(ws);
    try {
        const stop = await startScreencast({
            createCDPSession: async () => cdp,
        } as unknown as Page);
        emitter.emit('Page.screencastFrame', { data: 'base64-frame', sessionId: 4 });
        await stop();

        expect({ messages, commands }).toEqual({
            messages: [{ type: 'frame', data: 'base64-frame' }],
            commands: ['Page.startScreencast', 'Page.screencastFrameAck', 'Page.stopScreencast'],
        });
    } finally {
        removeWsClient(ws);
    }
});
