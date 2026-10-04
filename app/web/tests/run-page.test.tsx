import './helpers/dom';
import { expect, test } from 'bun:test';
import { act } from 'react';
import RunPage from '../src/pages/run';
import { useWebSocket } from '../src/pages/run/hooks';
import {
    latestNotice,
    button,
    choose,
    click,
    flush,
    render,
    renderPage,
    stubWebSockets,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

function runRecord(status: string) {
    return {
        id: 7,
        taskId: 1,
        taskName: '登录任务',
        model: 'vision',
        status,
        startedAt: '2026-01-01',
        finishedAt: null,
        durationMs: 200,
        tokenInput: 0,
        tokenOutput: 0,
        error: null,
    };
}
function stepRecord(status: string) {
    return {
        id: 8,
        runId: 7,
        stepIndex: 0,
        stepName: '点击登录',
        action: 'aiTap',
        status,
        durationMs: 1200,
        error: status === 'failed' ? '未找到按钮' : null,
        url: 'https://example.com/login',
    };
}
function queueItems() {
    return [
        {
            id: 1,
            taskId: 1,
            taskName: '排队甲',
            modelId: 'm',
            model: 'vision',
            status: 'pending',
            position: 1,
        },
        {
            id: 2,
            taskId: 1,
            taskName: '排队乙',
            modelId: 'm',
            model: 'vision',
            status: 'pending',
            position: 2,
        },
    ];
}
function basicHttp(path: string) {
    if (path === '/api/runs/current') return { status: 'idle', run: null };
    if (path === '/api/queue') return { items: queueItems() };
    if (path === '/api/tasks') return [{ id: 1, name: '登录任务' }];
    if (path === '/api/models')
        return { selected: 'm', models: [{ id: 'm', name: '视觉模型', model: 'vision' }] };
    throw new Error(`意外请求：${path}`);
}

test('实时页呈现准备、步骤开始、画面、成功和结束状态', async () => {
    const sockets = stubWebSockets();
    useHttp(({ path }) => basicHttp(path));
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    expect(document.body.textContent).toContain('当前没有运行中的任务');

    await flush(() => sockets[0]!.receive({ type: 'run', run: runRecord('running') }));
    expect(document.body.textContent).toContain('等待浏览器画面');
    await flush(() =>
        sockets[0]!.receive({
            type: 'step-start',
            runId: 7,
            stepIndex: 0,
            stepName: '点击登录',
            action: 'aiTap',
            totalSteps: 1,
        }),
    );
    expect(document.body.textContent).toContain('登录任务（1/1）');
    await flush(() => sockets[0]!.receive({ type: 'frame', data: 'ZmFrZQ==' }));
    await flush(() => sockets[0]!.receive({ type: 'step', step: stepRecord('success') }));
    await flush(() => sockets[0]!.receive({ type: 'run', run: runRecord('success') }));

    expect({
        image: document.querySelector('img')?.getAttribute('src'),
        content: document.body.textContent,
    }).toMatchObject({
        image: 'data:image/jpeg;base64,ZmFrZQ==',
        content: expect.stringContaining('上次运行结果：成功'),
    });
});

test('失败步骤显示错误和 URL，停止指令通过真实 API 包装发送', async () => {
    const sockets = stubWebSockets();
    const requests = useHttp(({ path }) =>
        path === '/api/runs/current/stop' ? { ok: true } : basicHttp(path),
    );
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    await flush(() => sockets[0]!.receive({ type: 'run', run: runRecord('running') }));
    await flush(() =>
        sockets[0]!.receive({
            type: 'step-start',
            runId: 7,
            stepIndex: 0,
            stepName: '点击登录',
            action: 'aiTap',
            totalSteps: 1,
        }),
    );
    await flush(() => sockets[0]!.receive({ type: 'step', step: stepRecord('failed') }));

    await click(button('停止运行'));

    expect({
        error: document.body.textContent?.includes('未找到按钮'),
        url: document.body.textContent?.includes('https://example.com/login'),
        last: requests.at(-1),
        message: latestNotice()?.title,
    }).toEqual({
        error: true,
        url: true,
        last: { path: '/api/runs/current/stop', method: 'POST', body: undefined },
        message: '已发送停止指令',
    });
});

test('队列上下移动和取消后使用返回列表刷新界面', async () => {
    stubWebSockets();
    const requests = useHttp(({ path, method, body }) => {
        if (path.endsWith('/move'))
            return {
                items:
                    (body as { direction: string }).direction === 'down'
                        ? queueItems().reverse()
                        : queueItems(),
            };
        if (method === 'DELETE') return { items: [] };
        return basicHttp(path);
    });
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    expect(button('上移').disabled).toBe(true);

    await click(button('下移'));
    await click([...document.querySelectorAll<HTMLButtonElement>('button[aria-label="上移"]')][1]!);
    await click(button('取消排队'));

    expect({
        changes: requests.filter((request) => request.method !== 'GET'),
        content: document.body.textContent,
    }).toEqual({
        changes: [
            { path: '/api/queue/1/move', method: 'POST', body: { direction: 'down' } },
            { path: '/api/queue/1/move', method: 'POST', body: { direction: 'up' } },
            { path: '/api/queue/1', method: 'DELETE', body: undefined },
        ],
        content: expect.stringContaining('队列为空'),
    });
});

test.each([true, false])('选择任务模型后发起运行并呈现服务端排队结果：%s', async (queued) => {
    stubWebSockets();
    let submitted: unknown;
    useHttp(({ path, body }) => {
        if (path === '/api/runs') {
            submitted = body;
            return { queued, runId: 7 };
        }
        return basicHttp(path);
    });
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    await click(button('添加'));
    expect(latestNotice()?.title).toBe('请选择任务和模型');

    await choose(0, '登录任务');
    await choose(1, '视觉模型');
    await click(button('添加'));

    expect({ submitted, message: latestNotice()?.title }).toEqual({
        submitted: { taskId: 1, modelId: 'm' },
        message: queued ? '已加入队列' : '已开始运行',
    });
});

test.each(['停止运行', '下移', '取消排队', '添加'])(
    '操作失败时显示服务端错误并保留页面：%s',
    async (action) => {
        const sockets = stubWebSockets();
        useHttp(({ path, method }) =>
            method === 'GET'
                ? basicHttp(path)
                : Response.json({ error: '操作被拒绝' }, { status: 500 }),
        );
        await renderPage(<RunPage />, { path: '/run', url: '/run' });
        if (action === '停止运行')
            await flush(() => sockets[0]!.receive({ type: 'run', run: runRecord('running') }));
        if (action === '添加') await choose(0, '登录任务');

        await click(button(action));

        expect(latestNotice()?.title).toBe('操作被拒绝');
    },
);

test('初始请求失败仍结束加载并能接收后续队列消息', async () => {
    const sockets = stubWebSockets();
    useHttp(() => Response.json({ error: '服务暂不可用' }, { status: 503 }));
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    expect(latestNotice()?.title).toBe('服务暂不可用');

    await flush(() => sockets[0]!.receive({ type: 'queue', items: queueItems() }));

    expect(document.body.textContent).toContain('排队乙');
});

test('WebSocket 忽略坏消息、读取最新回调，断线重连且卸载清理', async () => {
    const sockets = stubWebSockets();
    const messages: string[] = [];
    const originalTimeout = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    let retry: (() => void) | undefined;
    let cancelled = false;
    globalThis.setTimeout = ((callback: () => void, delay?: number, ...args: unknown[]) => {
        if (delay === 2000) {
            retry = callback;
            return 99999;
        }
        return originalTimeout(callback, delay, ...args);
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
        if (Number(timer) === 99999) {
            cancelled = true;
            return;
        }
        originalClear(timer);
    }) as typeof clearTimeout;
    function Listener({ prefix }: { prefix: string }) {
        useWebSocket((message) => messages.push(`${prefix}:${message.type}`));
        return <p>{prefix}</p>;
    }
    try {
        const { root } = await render(<Listener prefix='旧' />);
        await flush(() => sockets[0]!.receive('坏 JSON'));
        await act(async () => root.render(<Listener prefix='新' />));
        await flush(() => sockets[0]!.receive({ type: 'frame', data: 'a' }));
        await flush(() => sockets[0]!.close());
        await flush(() => retry!());
        await act(async () => root.unmount());

        expect({
            messages,
            urls: sockets.map((socket) => socket.url),
            closed: sockets.at(-1)?.closed,
            cancelled,
        }).toEqual({
            messages: ['新:frame'],
            urls: ['ws://localhost:3000/ws', 'ws://localhost:3000/ws'],
            closed: true,
            cancelled: true,
        });
    } finally {
        globalThis.setTimeout = originalTimeout;
        globalThis.clearTimeout = originalClear;
    }
});

test('更新已完成步骤不改变其他执行中步骤，忽略未知 WS 消息', async () => {
    const sockets = stubWebSockets();
    useHttp(({ path }) => basicHttp(path));
    await renderPage(<RunPage />, { path: '/run', url: '/run' });
    await flush(() => sockets[0]!.receive({ type: 'run', run: runRecord('running') }));
    await flush(() =>
        sockets[0]!.receive({
            type: 'step-start',
            runId: 7,
            stepIndex: 0,
            stepName: '第一步',
            action: 'aiTap',
            totalSteps: 2,
        }),
    );
    await flush(() =>
        sockets[0]!.receive({
            type: 'step-start',
            runId: 7,
            stepIndex: 1,
            stepName: '第二步',
            action: 'aiAssert',
            totalSteps: 2,
        }),
    );

    await flush(() => sockets[0]!.receive({ type: 'step', step: stepRecord('success') }));
    await flush(() => sockets[0]!.receive({ type: 'heartbeat' }));

    expect(document.body.textContent).toContain('第二步aiAssert执行中');
});
