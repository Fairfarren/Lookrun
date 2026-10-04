import { expect, test, spyOn } from 'bun:test';
import { Hono } from 'hono';
import sharp from 'sharp';
import { formatErrorMessage, formatRunHistory } from '../src/lib/ai-error';
import { extractLastAiResult } from '../src/lib/ai-result';
import { clickTargetForStep, markClickOnScreenshot } from '../src/lib/screenshot-marker';
import { canDirectNavigate, restrictDirectNavigate, siteKey } from '../src/lib/web-agent';
import { registerStatic } from '../src/lib/static';
import { findLauncherAppCenter, parseAndroidScreenSize } from '../src/services/android';
import { prepareModelSettings } from '../src/services/model-settings';
import { parseModelsConfig, parseVisionCheckResponse } from '../src/services/models';
import { androidTargetOf, webTargetOf, presentOrUndefined } from '../src/services/run-prepare';
import { dispatchLiveStep } from '../src/services/step-dispatch';

test('超长错误截断到500字符并保留省略提示', () => {
    expect(formatErrorMessage('错'.repeat(501))).toBe(`${'错'.repeat(500)}...`);
});

test('成功步骤保持原状且非步骤前缀的运行错误不重写', () => {
    const run = { error: '浏览器启动失败' } as Parameters<typeof formatRunHistory>[0];
    const steps = [
        { status: 'success', error: null },
        { status: 'failed', error: '失败', stepIndex: 1, action: 'ai' },
    ] as Parameters<typeof formatRunHistory>[1];

    expect(formatRunHistory(run, steps)).toEqual({ run, steps });
});

test('损坏的执行记录返回空摘要', () => {
    expect(extractLastAiResult(JSON.stringify({ executions: [{ tasks: null }] }))).toBeNull();
});

test('摘要忽略非对象步骤且保留有效动作', () => {
    expect(
        extractLastAiResult(JSON.stringify({ executions: [{ name: 'ai', tasks: [null] }] })),
    ).toEqual({ action: 'ai' });
});

test('不完整点击坐标不产生标记', () => {
    expect(clickTargetForStep('aiTap', { element: { center: [1] } })).toBeNull();
});

test('图片范围外的点击保留原图', async () => {
    const source = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#fff' },
    })
        .png()
        .toBuffer();

    expect(await markClickOnScreenshot(source, { center: [100, 100] })).toEqual(source);
});

test('单段本地主机名作为站点标识', () => {
    expect(siteKey('http://localhost:1234')).toBe('localhost');
});

test('无效起始地址禁止直接跳转', () => {
    expect(canDirectNavigate('invalid', 'https://page.test')).toBe(false);
});

test('没有执行器的导航动作不被补造执行器', () => {
    const actions = [{ name: 'Navigate' }];

    restrictDirectNavigate(actions, 'https://page.test');

    expect(actions).toEqual([{ name: 'Navigate' }]);
});

test('静态路由返回真实正文和资源类型', async () => {
    const app = new Hono();
    // 静态服务固定调用 Bun.file；用原生入口桩隔离磁盘，只断言 HTTP 响应。
    const file = spyOn(Bun, 'file').mockReturnValue(
        new Blob(['const ready = true;']) as Bun.BunFile,
    );
    try {
        registerStatic(app, { '/bundle.js': 'bundle.js' });
        const response = await app.request('/bundle.js');

        expect({
            body: await response.text(),
            type: response.headers.get('content-type'),
            status: response.status,
        }).toEqual({
            body: 'const ready = true;',
            type: 'application/javascript; charset=utf-8',
            status: 200,
        });
    } finally {
        file.mockRestore();
    }
});

test('桌面节点不可点击或缺少有效边界时继续查找', () => {
    const xml =
        '<node text="应用" clickable="false"/><node text="应用" clickable="true" bounds="invalid"/>';

    expect(findLauncherAppCenter(xml, '应用')).toBeNull();
});

test('设备尺寸输出无分辨率时返回诊断', () => {
    expect(() => parseAndroidScreenSize('设备离线')).toThrow('无法解析 Android 屏幕尺寸：设备离线');
});

test('模型配置缺少模型数组时拒绝保存', () => {
    expect(() =>
        prepareModelSettings({ baseUrl: 'https://model.test', apiKey: 'key' }, {}),
    ).toThrow();
});

test('模型服务地址不是URL时返回明确错误', () => {
    expect(() =>
        prepareModelSettings({ baseUrl: 'invalid', apiKey: 'key', models: [] }, {}),
    ).toThrow('有效的 HTTP 或 HTTPS 地址');
});

test('模型配置根节点不能是数组', () => {
    expect(() => parseModelsConfig([])).toThrow('模型配置必须是一个对象');
});

test('坐标必须是数字数组', () => {
    expect(parseVisionCheckResponse('{"bbox":"invalid"}')).toEqual({
        ok: false,
        reason: 'bbox 必须是 4 个数字的数组',
    });
});

test('归一化坐标没有覆盖按钮中心时拒绝通过', () => {
    expect(parseVisionCheckResponse('{"bbox":[700,700,900,900]}').ok).toBe(false);
});

test('网页运行拒绝Android目标', () => {
    expect(() =>
        webTargetOf({ target: { type: 'android', deviceId: 'device' }, tasks: [] }),
    ).toThrow('网页运行需要 web 目标');
});

test('Android运行拒绝网页目标', () => {
    expect(() =>
        androidTargetOf({ target: { type: 'web', url: 'https://page.test' }, tasks: [] }),
    ).toThrow('Android 运行需要 android 目标');
});

test('空配置值转换为未指定', () => {
    expect(presentOrUndefined(null)).toBeUndefined();
});

test('非字符串动作参数按空文本传递且成功断言保留结果', async () => {
    let prompt: unknown;
    const agent = {
        aiAssert: async (value: string) => {
            prompt = value;
            return { pass: true };
        },
    } as NonNullable<Parameters<typeof dispatchLiveStep>[0]['agent']>;

    const result = await dispatchLiveStep({
        agent,
        step: { action: 'aiAssert', params: 1 },
        sleep: async () => {},
    });

    expect({ prompt, result }).toEqual({ prompt: '', result: { pass: true } });
});
