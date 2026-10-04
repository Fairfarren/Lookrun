import { expect, test } from 'bun:test';
import { loadModels, tryLoadModels, checkModelVision } from '../src/services/models';
import { readModelSettings, writeModelSettings } from '../src/services/model-settings';

const config = {
    baseUrl: 'https://model.test/v1',
    apiKey: 'test-key',
    models: [{ id: 'model', name: '模型', model: 'vision', family: 'qwen' }],
};

test('模型加载优先使用运行时配置文件', () => {
    const result = loadModels({
        exists: () => true,
        read: (() => JSON.stringify(config)) as unknown as typeof import('node:fs').readFileSync,
    });

    expect(result).toEqual([
        {
            id: 'model',
            name: '模型',
            model: 'vision',
            family: 'qwen',
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
        },
    ]);
});

test('运行时配置损坏时返回包含路径和原因的错误', () => {
    const result = tryLoadModels({
        exists: () => true,
        read: (() => '{') as unknown as typeof import('node:fs').readFileSync,
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('运行时模型配置') });
});

test('没有运行时覆盖时使用内置模型配置', () => {
    const result = tryLoadModels({ exists: () => false, embedded: config });

    expect(result).toMatchObject({ ok: true, models: [{ id: 'model', apiKey: 'test-key' }] });
});

test('配置读取优先使用已保存文件', () => {
    const result = readModelSettings({
        exists: () => true,
        read: (() => JSON.stringify(config)) as unknown as typeof import('node:fs').readFileSync,
    });

    expect(result).toEqual(config);
});

test('没有配置文件时读取内置配置', () => {
    const result = readModelSettings({ exists: () => false });

    expect(result).toMatchObject({ models: expect.any(Array) });
});

test('配置先完整写入临时文件再原子替换', async () => {
    const operations: string[] = [];
    let contents = '';
    const write = (async (_file: string, data: string) => {
        contents = data;
        operations.push('写入');
        return data.length;
    }) as typeof Bun.write;

    await writeModelSettings(config, {
        write,
        chmod: (_file, mode) => {
            operations.push(`权限${mode}`);
        },
        rename: (from, to) => {
            operations.push(String(from).startsWith(`${to}.`) ? '原子替换' : '错误路径');
        },
    });

    expect({ operations, contents: JSON.parse(contents) }).toEqual({
        operations: ['写入', '权限384', '原子替换'],
        contents: config,
    });
});

test('写入失败时不覆盖已保存配置', async () => {
    const operations: string[] = [];
    const write = (async () => {
        throw new Error('磁盘已满');
    }) as typeof Bun.write;

    let error: unknown;
    try {
        await writeModelSettings(config, {
            write,
            rename: () => {
                operations.push('覆盖');
            },
        });
    } catch (caught) {
        error = caught;
    }

    expect({ operations, error: (error as Error).message }).toEqual({
        operations: [],
        error: '磁盘已满',
    });
});

function imageFile() {
    return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Bun.BunFile;
}

const model = { ...config.models[0], baseUrl: config.baseUrl, apiKey: config.apiKey };

test('视觉自检发送图片并解释模型坐标结果', async () => {
    let requestBody: unknown;
    const fetchStub = (async (_url: unknown, options: RequestInit) => {
        requestBody = JSON.parse(String(options.body));
        return Response.json({ choices: [{ message: { content: '{"bbox":[200,100,440,260]}' } }] });
    }) as unknown as typeof fetch;

    const result = await checkModelVision(model, {
        io: { file: imageFile as typeof Bun.file, fetch: fetchStub },
    });

    expect({ body: requestBody, result }).toMatchObject({
        body: {
            model: 'vision',
            messages: [
                {
                    role: 'user',
                    content: [
                        expect.any(Object),
                        { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
                    ],
                },
            ],
        },
        result: {
            ok: true,
            message: '视觉能力正常（绝对像素坐标），定位坐标 [200, 100, 440, 260]',
        },
    });
});

test('视觉自检HTTP失败返回状态和诊断', async () => {
    const result = await checkModelVision(model, {
        timeoutMs: 1000,
        io: {
            file: imageFile as typeof Bun.file,
            fetch: (async () =>
                new Response('服务不可用', { status: 503 })) as unknown as typeof fetch,
        },
    });

    expect(result).toEqual({ ok: false, message: '接口返回 503：服务不可用' });
});

test('视觉自检连接异常转换为可读错误', async () => {
    const result = await checkModelVision(model, {
        io: {
            file: imageFile as typeof Bun.file,
            fetch: (async () => {
                throw new Error('连接中断');
            }) as unknown as typeof fetch,
        },
    });

    expect(result).toEqual({ ok: false, message: '自检请求失败：连接中断' });
});

test('非法内置模型配置返回诊断而不伪装加载成功', () => {
    const result = tryLoadModels({
        exists: () => false,
        embedded: { ...config, apiKey: '请填写密钥' },
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('API Key 含有非法字符') });
});
