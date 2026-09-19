import './helpers/dom';
import { expect, test } from 'bun:test';
import QueueEditPage from '../src/pages/queue-edit';
import {
    keyboardDrag,
    button,
    choose,
    click,
    field,
    input,
    latestNotice,
    renderPage,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

function initial(path: string) {
    if (path === '/api/tasks')
        return [
            { id: 1, name: '登录' },
            { id: 2, name: '购买' },
        ];
    if (path === '/api/models')
        return {
            selected: 'm',
            models: [
                { id: 'm', name: '模型甲' },
                { id: 'n', name: '模型乙' },
            ],
        };
    if (path === '/api/queues/3')
        return { id: 3, name: '原队列', items: [{ taskId: 1, modelId: 'm' }] };
    throw new Error(`意外请求：${path}`);
}

test('新建队列先校验名称和任务，再创建并保存有序条目', async () => {
    const writes: unknown[] = [];
    useHttp(({ path, method, body }) => {
        if (method !== 'GET') {
            writes.push({ path, method, body });
            return { id: 9 };
        }
        return initial(path);
    });
    await renderPage(<QueueEditPage />, { path: '/queues/:id', url: '/queues/new' });
    await click(button('保存'));
    expect(latestNotice()?.title).toBe('请填写队列名');
    await input(field('例如：每日冒烟测试'), ' 每日验证 ');
    await click(button('保存'));
    expect(latestNotice()?.title).toBe('至少添加一个任务');
    await choose(0, '登录');
    await choose(1, '模型甲');
    await click(button('添加任务'));
    await choose(2, '购买');
    await choose(3, '模型乙');

    await click(button('保存'));

    expect(writes).toEqual([
        { path: '/api/queues', method: 'POST', body: { name: '每日验证' } },
        {
            path: '/api/queues/9',
            method: 'PUT',
            body: {
                name: '每日验证',
                items: [
                    { taskId: 1, modelId: 'm' },
                    { taskId: 2, modelId: 'n' },
                ],
            },
        },
    ]);
});

test('编辑队列增删条目并保存，不再创建队列', async () => {
    let written: unknown;
    useHttp(({ path, method, body }) => {
        if (method === 'PUT') {
            written = body;
            return { id: 3 };
        }
        return initial(path);
    });
    await renderPage(<QueueEditPage />, { path: '/queues/:id', url: '/queues/3' });
    expect(button('删除任务项').disabled).toBe(true);
    await click(button('添加任务'));
    await choose(2, '购买');
    await choose(3, '模型乙');
    await click(button('删除任务项'));
    await input(field('例如：每日冒烟测试'), '更名队列');

    await click(button('保存'));

    expect(written).toEqual({ name: '更名队列', items: [{ taskId: 2, modelId: 'n' }] });
});

test('队列保存失败保留编辑内容并恢复按钮', async () => {
    useHttp(({ path, method }) =>
        method === 'PUT'
            ? Response.json({ error: '队列保存失败' }, { status: 500 })
            : initial(path),
    );
    await renderPage(<QueueEditPage />, { path: '/queues/:id', url: '/queues/3' });

    await click(button('保存'));

    expect({
        name: field('例如：每日冒烟测试').value,
        disabled: button('保存').disabled,
        message: latestNotice()?.title,
    }).toEqual({ name: '原队列', disabled: false, message: '队列保存失败' });
});

test('编辑页读取失败时反馈错误，返回按钮仍可使用', async () => {
    useHttp(() => Response.json({ error: '队列读取失败' }, { status: 500 }));
    await renderPage(<QueueEditPage />, { path: '/queues/:id', url: '/queues/3' });
    expect(latestNotice()?.title).toBe('队列读取失败');

    await click(button('返回'));

    expect(document.querySelector('[data-testid="location"]')?.textContent).toBe('/queues');
});

test('键盘拖拽调整队列顺序，保存结果遵循新顺序', async () => {
    let saved: unknown;
    useHttp(({ path, method, body }) => {
        if (method === 'PUT') {
            saved = body;
            return { id: 3 };
        }
        if (path === '/api/queues/3')
            return {
                id: 3,
                name: '队列',
                items: [
                    { taskId: 1, modelId: 'm' },
                    { taskId: 2, modelId: 'n' },
                ],
            };
        return initial(path);
    });
    await renderPage(<QueueEditPage />, { path: '/queues/:id', url: '/queues/3' });

    await keyboardDrag([
        ...document.querySelectorAll<HTMLButtonElement>('button[title="拖拽排序"]'),
    ]);
    await click(button('保存'));

    expect(saved).toEqual({
        name: '队列',
        items: [
            { taskId: 2, modelId: 'n' },
            { taskId: 1, modelId: 'm' },
        ],
    });
});
