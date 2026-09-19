import './helpers/dom';
import { expect, test } from 'bun:test';
import TasksPage from '../src/pages/tasks';
import QueuesPage from '../src/pages/queues';
import HistoryPage from '../src/pages/history';
import {
    latestNotice,
    button,
    click,
    deferred,
    flush,
    renderPage,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

function taskRecord() {
    return {
        id: 1,
        name: '登录流程',
        yaml: 'target: https://example.com',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
    };
}
function queueRecord() {
    return { id: 3, name: '每日回归', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
}
function location() {
    return document.querySelector('[data-testid="location"]')?.textContent;
}

for (const kind of ['tasks', 'queues'] as const) {
    const element = kind === 'tasks' ? <TasksPage /> : <QueuesPage />;
    const record = kind === 'tasks' ? taskRecord() : queueRecord();
    const label = kind === 'tasks' ? '任务' : '队列';
    const response = (items: unknown[]) => (kind === 'tasks' ? items : { items });

    test(`${label}列表从加载态转为空态`, async () => {
        const pending = deferred<unknown>();
        useHttp(() => pending.promise);
        await renderPage(element, { path: `/${kind}`, url: `/${kind}` });
        expect(document.querySelector('[data-slot="card-content"]')?.textContent).not.toContain(
            record.name,
        );

        await flush(() => pending.resolve(response([])));

        expect(document.body.textContent).toContain(kind === 'tasks' ? '还没有任务' : '还没有队列');
    });

    test(`${label}列表请求失败提示原因且结束加载`, async () => {
        useHttp(() => Response.json({ error: '列表读取失败' }, { status: 500 }));

        await renderPage(element, { path: `/${kind}`, url: `/${kind}` });

        expect(latestNotice()?.title).toBe('列表读取失败');
    });

    test.each(['新建', '编辑'])(`${label}列表%s导航到对应编辑页`, async (action) => {
        useHttp(() => response([record]));
        await renderPage(element, { path: `/${kind}`, url: `/${kind}` });

        await click(button(action === '新建' ? `新建${label}` : '编辑'));

        expect(location()).toBe(`/${kind}/${action === '新建' ? 'new' : record.id}`);
    });

    test(`${label}删除取消不发请求，确认后删除并刷新列表`, async () => {
        let items = [record];
        useHttp((request) => {
            if (request.method === 'DELETE') {
                items = [];
                return { ok: true };
            }
            return response(items);
        });
        await renderPage(element, { path: `/${kind}`, url: `/${kind}` });
        await click(button(`删除${label}`));
        expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(record.name);
        await click(button('取消'));
        expect(items).toHaveLength(1);

        await click(button(`删除${label}`));
        await click(button('删除'));

        expect({ items, empty: document.body.textContent?.includes(`还没有${label}`) }).toEqual({
            items: [],
            empty: true,
        });
    });

    test(`${label}删除失败保留列表并提示错误`, async () => {
        useHttp((request) =>
            request.method === 'DELETE'
                ? Response.json({ error: '删除失败' }, { status: 500 })
                : response([record]),
        );
        await renderPage(element, { path: `/${kind}`, url: `/${kind}` });

        await click(button(`删除${label}`));
        await click(button('删除'));

        expect({
            visible: document.body.textContent?.includes(record.name),
            message: latestNotice()?.title,
        }).toEqual({ visible: true, message: '删除失败' });
    });
}

test.each([true, false])('任务开始后按排队结果决定是否跳转：%s', async (queued) => {
    let submitted: unknown;
    useHttp((request) => {
        if (request.path === '/api/tasks') return [taskRecord()];
        if (request.path === '/api/models')
            return { selected: 'm', models: [{ id: 'm', name: '模型', model: 'vision' }] };
        submitted = request.body;
        return { queued, runId: 7 };
    });
    await renderPage(<TasksPage />, { path: '/tasks', url: '/tasks' });
    await click(button('运行'));

    await click(button('开始运行'));

    expect({ submitted, page: location() }).toEqual({
        submitted: { taskId: 1, modelId: 'm' },
        page: queued ? '/tasks' : '/run',
    });
});

test('任务运行对话框可取消，没有模型时不能提交', async () => {
    const requests = useHttp((request) =>
        request.path === '/api/tasks' ? [taskRecord()] : { selected: null, models: [] },
    );
    await renderPage(<TasksPage />, { path: '/tasks', url: '/tasks' });
    await click(button('运行'));
    await click(button('开始运行'));
    await click(button('取消'));

    expect({
        posts: requests.filter((item) => item.method === 'POST'),
        dialog: document.querySelector('[role="dialog"]'),
    }).toEqual({ posts: [], dialog: null });
});

test('任务运行失败后保留对话框，可重新提交', async () => {
    useHttp((request) => {
        if (request.path === '/api/tasks') return [taskRecord()];
        if (request.path === '/api/models')
            return { selected: null, models: [{ id: 'm', name: '模型', model: 'vision' }] };
        return Response.json({ error: '运行校验失败' }, { status: 400 });
    });
    await renderPage(<TasksPage />, { path: '/tasks', url: '/tasks' });
    await click(button('运行'));

    await click(button('开始运行'));

    expect({ message: latestNotice()?.title, disabled: button('开始运行').disabled }).toEqual({
        message: '运行校验失败',
        disabled: false,
    });
});

test('读取可运行模型失败时反馈错误，关闭按钮关闭弹窗', async () => {
    useHttp((request) =>
        request.path === '/api/tasks'
            ? [taskRecord()]
            : Response.json({ error: '模型不可读' }, { status: 500 }),
    );
    await renderPage(<TasksPage />, { path: '/tasks', url: '/tasks' });

    await click(button('运行'));
    const message = latestNotice()?.title;
    await click(button('关闭'));

    expect({ message, dialog: document.querySelector('[role="dialog"]') }).toEqual({
        message: '模型不可读',
        dialog: null,
    });
});

test.each([{ errors: [] }, { errors: ['任务缺失'] }])(
    '队列启动结果展示并进入运行页：%j',
    async ({ errors }) => {
        useHttp((request) =>
            request.method === 'GET'
                ? { items: [queueRecord()] }
                : { started: 1, queued: 1, errors },
        );
        await renderPage(<QueuesPage />, { path: '/queues', url: '/queues' });

        await click(button('开始'));

        expect({ page: location(), notification: latestNotice()?.type }).toEqual({
            page: '/run',
            notification: errors.length ? 'warning' : 'success',
        });
    },
);

test('队列启动失败留在列表并恢复按钮', async () => {
    useHttp((request) =>
        request.method === 'GET'
            ? { items: [queueRecord()] }
            : Response.json({ error: '队列启动失败' }, { status: 500 }),
    );
    await renderPage(<QueuesPage />, { path: '/queues', url: '/queues' });

    await click(button('开始'));

    expect({
        page: location(),
        disabled: button('开始').disabled,
        message: latestNotice()?.title,
    }).toEqual({ page: '/queues', disabled: false, message: '队列启动失败' });
});

test('历史记录展示运行结果，分页切换参数正确且可返回上一页', async () => {
    const requests = useHttp((request) => ({
        list: [
            {
                id: request.path.includes('offset=20') ? 21 : 1,
                taskName: '历史任务',
                status: 'success',
                model: 'vision',
                startedAt: '2026-01-01',
                durationMs: 1234,
                tokenInput: 10,
                tokenOutput: 2,
                error: null,
            },
        ],
        total: 21,
    }));
    await renderPage(<HistoryPage />, { path: '/history', url: '/history' });
    expect(button('上一页').disabled).toBe(true);

    await click(button('下一页'));
    expect(button('下一页').disabled).toBe(true);
    await click(button('上一页'));

    expect({
        paths: requests.map((item) => item.path),
        detail: document.querySelector('a')?.getAttribute('href'),
    }).toEqual({
        paths: [
            '/api/runs?limit=20&offset=0',
            '/api/runs?limit=20&offset=20',
            '/api/runs?limit=20&offset=0',
        ],
        detail: '/history/1',
    });
});

test('历史记录请求失败提示错误并展示空列表', async () => {
    useHttp(() => Response.json({ error: '历史记录不可用' }, { status: 500 }));

    await renderPage(<HistoryPage />, { path: '/history', url: '/history' });

    expect({
        message: latestNotice()?.title,
        rows: document.querySelectorAll('tbody tr').length,
    }).toEqual({ message: '历史记录不可用', rows: 0 });
});
