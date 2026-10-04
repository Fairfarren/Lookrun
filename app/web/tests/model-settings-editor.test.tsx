import './helpers/dom';
import { expect, test } from 'bun:test';
import { ModelSettingsEditor } from '../src/pages/settings/model-settings';
import {
    latestNotice,
    button,
    click,
    deferred,
    field,
    flush,
    input,
    renderPage,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

function savedConfig() {
    return {
        baseUrl: 'https://models.example/v1',
        hasApiKey: true,
        models: [{ id: 'model-a', name: '视觉模型', model: 'vision-v1', family: 'qwen3-vl' }],
    };
}

test('配置加载中显示等待状态，加载后显示已保存字段且不回显密钥', async () => {
    const pending = deferred<ReturnType<typeof savedConfig>>();
    useHttp(() => pending.promise);
    await renderPage(<ModelSettingsEditor onSaved={() => {}} />, { path: '/', url: '/' });
    expect(document.body.textContent).toContain('正在加载模型配置');

    await flush(() => pending.resolve(savedConfig()));

    expect([...document.querySelectorAll('input')].map((item) => item.value)).toEqual([
        'https://models.example/v1',
        '',
        '视觉模型',
        'vision-v1',
    ]);
});

test('编辑地址密钥名称和系列后保存，保留服务器返回配置并清空密钥', async () => {
    let result: unknown;
    let completed = false;
    const pending = deferred<ReturnType<typeof savedConfig>>();
    useHttp((request) => {
        if (request.method === 'GET') return savedConfig();
        result = request.body;
        return pending.promise;
    });
    await renderPage(
        <ModelSettingsEditor
            onSaved={() => {
                completed = true;
            }}
        />,
        { path: '/', url: '/' },
    );

    await input(field('https://example.com/v1'), 'https://updated.example/v1');
    await input(document.querySelector<HTMLInputElement>('input[type="password"]')!, 'new-secret');
    await input(field('例如：视觉模型'), '新模型名称');
    await input(field('服务商提供的模型名称'), 'vision-v2');
    await input(document.querySelector('select')!, 'kimi');
    await click(button('保存模型配置'));
    expect(document.querySelector('fieldset')?.disabled).toBe(true);
    await flush(() => pending.resolve({ ...savedConfig(), baseUrl: 'https://updated.example/v1' }));

    expect({
        result,
        completed,
        key: document.querySelector<HTMLInputElement>('input[type="password"]')?.value,
    }).toEqual({
        result: {
            baseUrl: 'https://updated.example/v1',
            hasApiKey: true,
            apiKey: 'new-secret',
            models: [{ id: 'model-a', name: '新模型名称', model: 'vision-v2', family: 'kimi' }],
        },
        completed: true,
        key: '',
    });
});

test('加载失败显示错误和重试按钮，重试成功后恢复编辑', async () => {
    let fail = true;
    useHttp(() =>
        fail ? Response.json({ error: '配置暂不可读' }, { status: 503 }) : savedConfig(),
    );
    await renderPage(<ModelSettingsEditor onSaved={() => {}} />, { path: '/', url: '/' });
    expect(document.body.textContent).toContain('配置暂不可读');

    fail = false;
    await click(button('重试'));

    expect(field('例如：视觉模型').value).toBe('视觉模型');
});

test('保存失败保留未保存密钥并恢复可编辑状态', async () => {
    let completed = false;
    useHttp((request) =>
        request.method === 'GET'
            ? savedConfig()
            : Response.json({ error: '无写入权限' }, { status: 500 }),
    );
    await renderPage(
        <ModelSettingsEditor
            onSaved={() => {
                completed = true;
            }}
        />,
        { path: '/', url: '/' },
    );
    await input(
        document.querySelector<HTMLInputElement>('input[type="password"]')!,
        'retry-secret',
    );

    await click(button('保存模型配置'));

    expect({
        completed,
        disabled: document.querySelector('fieldset')?.disabled,
        key: document.querySelector<HTMLInputElement>('input[type="password"]')?.value,
        message: latestNotice()?.title,
    }).toEqual({ completed: false, disabled: false, key: 'retry-secret', message: '无写入权限' });
});

test('新增模型后可独立编辑和删除，至少保留一个模型', async () => {
    useHttp(() => ({ ...savedConfig(), hasApiKey: false }));
    await renderPage(<ModelSettingsEditor onSaved={() => {}} />, { path: '/', url: '/' });
    expect(button('删除模型 视觉模型').disabled).toBe(true);

    await click(button('添加模型'));
    const names = document.querySelectorAll<HTMLInputElement>(
        'input[placeholder="例如：视觉模型"]',
    );
    await input(names[1]!, '临时模型');
    await click(button('删除模型 临时模型'));

    expect(
        [...document.querySelectorAll<HTMLInputElement>('input[placeholder="例如：视觉模型"]')].map(
            (item) => item.value,
        ),
    ).toEqual(['视觉模型']);
});
