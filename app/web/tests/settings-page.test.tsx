import './helpers/dom';
import { expect, test } from 'bun:test';
import SettingsPage from '../src/pages/settings';
import {
    button,
    choose,
    click,
    deferred,
    field,
    flush,
    input,
    latestNotice,
    renderPage,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

function settingsResponse(path: string) {
    if (path === '/api/models/config')
        return {
            baseUrl: 'https://example.com/v1',
            hasApiKey: true,
            models: [{ id: 'm', name: '模型甲', model: 'vision-a', family: 'kimi' }],
        };
    if (path === '/api/models')
        return {
            selected: 'm',
            models: [
                { id: 'm', name: '模型甲', model: 'vision-a' },
                { id: 'n', name: '模型乙', model: 'vision-b' },
            ],
        };
    if (path === '/api/variables') return { USER: 'old', KEEP: 'fixed' };
    if (path === '/api/system')
        return { chromePath: '/chrome', adbPath: null, dataDir: '/data', version: '0.1.0' };
    if (path === '/api/system/storage')
        return {
            screenshotsBytes: 100,
            reportsBytes: 200,
            databaseBytes: 300,
            totalBytes: 600,
            runCount: 2,
        };
    throw new Error(`意外请求：${path}`);
}

test('加载系统信息与存储统计，复制已检测到的路径', async () => {
    useHttp(({ path }) => settingsResponse(path));
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });

    await click(button('复制'));

    expect({
        copied: await navigator.clipboard.readText(),
        content: document.body.textContent,
    }).toEqual({ copied: '/chrome', content: expect.stringContaining('600 B') });
});

test('变量新增编辑删除后保存只提交当前可见数据', async () => {
    let stored: unknown;
    useHttp(({ path, method, body }) => {
        if (path === '/api/variables' && method === 'PUT') {
            stored = body;
            return { ok: true };
        }
        return settingsResponse(path);
    });
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await click(button('添加变量'));
    await click(button('保存变量'));
    expect(latestNotice()?.title).toBe('变量名不能为空');
    const names = document.querySelectorAll<HTMLInputElement>(
        'input[placeholder="变量名，如 USERNAME"]',
    );
    const values = document.querySelectorAll<HTMLInputElement>('input[placeholder="变量值"]');
    await input(names[0]!, ' LOGIN ');
    await input(values[0]!, 'alice');
    await input(names[2]!, 'TEMP');
    await click(
        [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="删除变量"]')][2]!,
    );

    await click(button('保存变量'));

    expect(stored).toEqual({ variables: { LOGIN: 'alice', KEEP: 'fixed' } });
});

test('变量保存失败后恢复保存按钮并提示原因', async () => {
    useHttp(({ path, method }) =>
        method === 'PUT'
            ? Response.json({ error: '变量写入失败' }, { status: 500 })
            : settingsResponse(path),
    );
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });

    await click(button('保存变量'));

    expect({ message: latestNotice()?.title, disabled: button('保存变量').disabled }).toEqual({
        message: '变量写入失败',
        disabled: false,
    });
});

test('删除全部变量后展示空态', async () => {
    useHttp(({ path }) => settingsResponse(path));
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });

    await click(button('删除变量'));
    await click(button('删除变量'));

    expect(document.body.textContent).toContain('还没有变量');
});

test('更换默认模型并自检，等待时禁用按钮，成功结果可见', async () => {
    const pending = deferred<{ ok: boolean; message: string }>();
    const requests = useHttp(({ path, method }) => {
        if (path.endsWith('/check')) return pending.promise;
        if (method === 'PUT') return { ok: true };
        return settingsResponse(path);
    });
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await choose(0, '模型乙（vision-b）');
    await click(button('视觉自检'));
    expect(button('视觉自检').disabled).toBe(true);

    await flush(() => pending.resolve({ ok: true, message: '坐标准确' }));

    expect({
        writes: requests.filter((item) => item.method !== 'GET'),
        text: document.body.textContent,
    }).toEqual({
        writes: [
            { path: '/api/models/select', method: 'PUT', body: { id: 'n' } },
            { path: '/api/models/n/check', method: 'POST', body: undefined },
        ],
        text: expect.stringContaining('坐标准确'),
    });
});

test('默认模型和视觉自检请求失败分别反馈错误', async () => {
    useHttp(({ path, method }) =>
        method === 'GET'
            ? settingsResponse(path)
            : Response.json({ error: '模型连接失败' }, { status: 500 }),
    );
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await choose(0, '模型乙（vision-b）');
    expect(latestNotice()?.title).toBe('模型连接失败');

    await click(button('视觉自检'));

    expect(document.querySelector('[role="alert"]')?.textContent).toContain('模型连接失败');
});

test('无可用模型时自检不发请求，其他初始化失败仍可编辑', async () => {
    const requests = useHttp(({ path }) => {
        if (path === '/api/models') return { selected: null, models: [] };
        if (path === '/api/models/config') return settingsResponse(path);
        return Response.json({ error: '初始化失败' }, { status: 500 });
    });
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });

    await click(button('视觉自检'));

    expect({
        posts: requests.filter((item) => item.method === 'POST'),
        message: latestNotice()?.title,
    }).toEqual({ posts: [], message: '初始化失败' });
});

test('模型列表加载失败显示错误', async () => {
    useHttp(({ path }) =>
        path === '/api/models'
            ? Response.json({ error: '无法读取模型' }, { status: 500 })
            : settingsResponse(path),
    );

    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });

    expect(latestNotice()?.title).toBe('无法读取模型');
});

test('清空历史先确认，取消不提交，确认后刷新统计', async () => {
    let clean = false;
    const requests = useHttp(({ path }) => {
        if (path.endsWith('/cleanup')) {
            clean = true;
            return { deletedRuns: 2, freedBytes: 300 };
        }
        if (path.endsWith('/storage') && clean)
            return {
                screenshotsBytes: 0,
                reportsBytes: 0,
                databaseBytes: 300,
                totalBytes: 300,
                runCount: 0,
            };
        return settingsResponse(path);
    });
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await click(button('清空历史记录'));
    await click(button('取消'));
    expect(clean).toBe(false);
    await click(button('清空历史记录'));

    await click(button('全部清空'));

    expect({
        clean,
        updates: requests.filter((item) => item.method === 'POST').map((item) => item.path),
        text: document.body.textContent,
    }).toEqual({
        clean: true,
        updates: ['/api/system/storage/cleanup'],
        text: expect.stringContaining('0 次运行'),
    });
});

test('清空历史失败恢复按钮并保留统计', async () => {
    useHttp(({ path, method }) =>
        method === 'POST'
            ? Response.json({ error: '清理失败' }, { status: 500 })
            : settingsResponse(path),
    );
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await click(button('清空历史记录'));

    await click(button('全部清空'));

    expect({
        message: latestNotice()?.title,
        disabled: button('清空历史记录').disabled,
        text: document.body.textContent,
    }).toEqual({ message: '清理失败', disabled: false, text: expect.stringContaining('2 次运行') });
});

test('保存模型设置后刷新默认模型列表', async () => {
    let updated = false;
    useHttp(({ path, method }) => {
        if (path === '/api/models/config' && method === 'PUT') {
            updated = true;
            return settingsResponse(path);
        }
        if (path === '/api/models' && updated)
            return {
                selected: 'n',
                models: [{ id: 'n', name: '新默认模型', model: 'vision-new' }],
            };
        return settingsResponse(path);
    });
    await renderPage(<SettingsPage />, { path: '/settings', url: '/settings' });
    await input(field('例如：视觉模型'), '新显示名称');

    await click(button('保存模型配置'));

    expect(document.querySelector('[role="combobox"]')?.textContent).toContain('新默认模型');
});
