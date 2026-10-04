import './helpers/dom';
import { expect, test } from 'bun:test';
import RunDetailPage from '../src/pages/history-detail';
import { button, click, latestNotice, renderPage, useDomTests, useHttp } from './helpers/render';

useDomTests();

function run() {
    return {
        id: 7,
        taskId: 1,
        taskName: '登录任务',
        model: 'vision',
        status: 'failed',
        startedAt: '2026-01-01',
        finishedAt: '2026-01-01',
        durationMs: 1200,
        tokenInput: 20,
        tokenOutput: 3,
        error: '执行失败',
    };
}
function step() {
    return {
        id: 8,
        runId: 7,
        stepIndex: 0,
        stepName: '点击登录',
        action: 'aiTap',
        status: 'failed',
        durationMs: 200,
        tokenInput: 20,
        tokenOutput: 3,
        error: '按钮不存在',
        url: 'https://example.com/login',
        prompt: '点击登录按钮',
        aiResult: '{"found":false}',
        shotBefore: '7/before.jpg',
        shotAfter: '7/after.jpg',
    };
}

test('历史详情展示失败上下文和格式化结果，截图可放大关闭且 URL 可复制', async () => {
    useHttp(() => ({ run: run(), steps: [step()] }));
    await renderPage(<RunDetailPage />, { path: '/history/:id', url: '/history/7' });
    expect(document.querySelector('pre')?.textContent).toBe('{\n  "found": false\n}');
    await click(button('复制'));
    expect(await navigator.clipboard.readText()).toBe('https://example.com/login');

    await click(document.querySelector<HTMLImageElement>('img[alt="执行前截图"]')!.parentElement!);
    expect(document.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(
        '/api/screenshots/7/before.jpg',
    );
    await click(button('关闭'));

    expect({
        dialog: document.querySelector('[role="dialog"]'),
        text: document.body.textContent,
    }).toEqual({ dialog: null, text: expect.stringContaining('按钮不存在') });
});

test('历史详情支持未开始步骤和非 JSON 结果，缺少的可选内容不显示', async () => {
    useHttp(() => ({
        run: {
            ...run(),
            status: 'stopped',
            tokenInput: 0,
            tokenOutput: 0,
            finishedAt: null,
            durationMs: null,
            error: null,
        },
        steps: [
            {
                ...step(),
                status: 'success',
                aiResult: '普通文字',
                tokenInput: 0,
                tokenOutput: 0,
                error: null,
                shotBefore: null,
                shotAfter: null,
            },
            {
                ...step(),
                id: 9,
                stepIndex: 1,
                status: 'pending',
                aiResult: null,
                prompt: null,
                url: null,
                error: null,
                shotBefore: null,
                shotAfter: null,
            },
        ],
    }));

    await renderPage(<RunDetailPage />, { path: '/history/:id', url: '/history/7' });

    expect({
        results: [...document.querySelectorAll('pre')].map((node) => node.textContent),
        images: document.querySelectorAll('img').length,
        content: document.body.textContent,
    }).toEqual({ results: ['普通文字'], images: 0, content: expect.stringContaining('已停止') });
});

test('运行记录不存在时显示明确空态', async () => {
    useHttp(() => ({ run: null, steps: [] }));

    await renderPage(<RunDetailPage />, { path: '/history/:id', url: '/history/99' });

    expect(document.body.textContent).toContain('运行记录不存在');
});

test('详情请求失败显示原因并结束加载', async () => {
    useHttp(() => Response.json({ error: '读取详情失败' }, { status: 500 }));

    await renderPage(<RunDetailPage />, { path: '/history/:id', url: '/history/7' });

    expect({ message: latestNotice()?.title, content: document.body.textContent }).toEqual({
        message: '读取详情失败',
        content: expect.stringContaining('运行记录不存在'),
    });
});
