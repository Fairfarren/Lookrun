import './helpers/dom';
import { expect, test } from 'bun:test';
import { MemoryRouter } from 'react-router-dom';
import { ACTION_OPTIONS } from '@lookrun/shared';
import App from '../src/App';
import { formatTime } from '../src/components';
import { setLocale, t } from '../src/i18n';
import { translateError } from '../src/i18n/errors';
import { requestErrorText } from '../src/api/request';
import { runProgressText } from '../src/pages/run/utils';
import { queueCardTitle } from '../src/pages/run/run-ws';
import { startQueueFeedback } from '../src/pages/queues/utils';
import {
    button,
    click,
    field,
    input,
    latestNotice,
    render,
    stubDelay,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

test.each([
    ['任务不存在', 'Task not found'],
    ['未知原始错误', '未知原始错误'],
    [
        '第 2 步：timeout 必须是正数毫秒',
        'Step 2: timeout must be a positive number in milliseconds',
    ],
    ['任务 1：缺少 name 字段（步骤组名称）', 'Task 1: name is missing (the step group name)'],
    [
        '第 3 步（登录）失败：API Key 无效，请检查 models.json 中的配置',
        'Step 3 (登录) failed: The API key is invalid. Check Settings → AI models.',
    ],
    [
        '任务「任务 1」校验失败：tasks 必须是非空数组；缺少 target 字段（被测页面地址）',
        'Task “任务 1” failed validation: tasks must be a non-empty array; target is missing (the page URL to test)',
    ],
    [
        '模型无法用于 UI 自动化：bbox 面积为零',
        'The model cannot be used for UI automation: bbox has zero area',
    ],
    ['YAML 语法错误：第 1 行\n字段缺失', 'YAML syntax error: 第 1 行\n字段缺失'],
])('test_英语错误提示_%s', (message, expected) => {
    setLocale('en');

    const result = translateError(message);

    expect(result).toBe(expected);
});

test('test_中文错误提示_保留原始文案', () => {
    setLocale('zh-CN');

    const result = translateError('第 2 步：timeout 必须是正数毫秒');

    expect(result).toBe('第 2 步：timeout 必须是正数毫秒');
});

test('test_接口多个错误_显示英语并使用英语分隔符', () => {
    setLocale('en');

    const result = requestErrorText({ errors: ['任务不存在', '队列不存在'] }, 400);

    expect(result).toBe('Task not found; Queue not found');
});

test('test_动作元数据_全部提供英语文案', () => {
    setLocale('en');

    const labels = ACTION_OPTIONS.flatMap((option) => [
        t(option.label),
        ...option.fields.flatMap((field) => [
            t(field.label),
            t(field.placeholder ?? ''),
            ...(field.options ?? []).map((item) => t(item.label)),
        ]),
    ]);

    expect(labels.every((label) => !/\p{Script=Han}/u.test(label))).toBe(true);
});

test('test_时间格式_遵循英语选择', () => {
    setLocale('en');
    const date = '2026-01-02T13:14:15Z';

    const result = formatTime(date);

    expect(result).toBe(new Date(date).toLocaleString('en', { hour12: false }));
});

test.each(['en', 'zh-CN'] as const)('test_队列更新时间_遵循语言选择_%s', async (locale) => {
    setLocale(locale);
    const updatedAt = '2026-01-02T13:14:15Z';
    useHttp(() => ({ items: [{ id: 1, name: '每日回归', updatedAt }] }));
    await render(
        <MemoryRouter initialEntries={['/queues']}>
            <App />
        </MemoryRouter>,
    );

    const text = document.querySelector('main')?.textContent;

    expect(text).toContain(
        `${t('更新于')} ${new Date(updatedAt).toLocaleString(locale, { hour12: false })}`,
    );
});

test('test_准备中的运行_保留用户任务名', () => {
    setLocale('en');

    const result = runProgressText({ taskName: '登录流程', currentStepIndex: -1, totalSteps: 0 });

    expect(result).toBe('登录流程 (preparing)');
});

test('test_待运行数量_使用英语动态文案', () => {
    setLocale('en');

    const result = queueCardTitle(2);

    expect(result).toBe('Task queue (2 pending)');
});

test('test_队列启动结果_保留中文名称', () => {
    setLocale('en');

    const result = startQueueFeedback({ name: '每日回归', started: 1, queued: 2, errors: [] });

    expect(result.text).toBe('Started queue “每日回归”: 1 running, 2 queued');
});

test('test_切换语言_保留未保存表单并翻译动作字段', async () => {
    setLocale('en');
    const validate = stubDelay(800);
    useHttp(() => ({ ok: true, errors: [], devices: [] }));
    await render(
        <MemoryRouter initialEntries={['/tasks/new']}>
            <App />
        </MemoryRouter>,
    );
    await input(field('E.g. sign-in smoke test'), '登录回归');
    await input(field('Start URL, e.g. https://h5.example.com'), 'https://example.com');
    await input(field('E.g. sign-in button'), '登录按钮');

    await input(document.querySelector('select')!, 'zh-CN');
    await validate();

    expect({
        name: field('例如：登录冒烟测试').value,
        url: field('起始页面地址，如 https://h5.example.com').value,
        prompt: field('如：登录按钮').value,
        action: document.querySelector('[role="combobox"]')?.textContent,
        banner: document.querySelector('[data-testid="script-validation-banner"]')?.textContent,
    }).toEqual({
        name: '登录回归',
        url: 'https://example.com',
        prompt: '登录按钮',
        action: '点击',
        banner: '校验通过',
    });
});

test('test_英语校验错误_切换中文后同步显示', async () => {
    setLocale('en');
    const validate = stubDelay(800);
    useHttp(() => ({ ok: false, errors: ['缺少 target 字段（被测页面地址）'] }));
    await render(
        <MemoryRouter initialEntries={['/tasks/new']}>
            <App />
        </MemoryRouter>,
    );
    await validate();
    expect(
        document.querySelector('[data-testid="script-validation-banner"]')?.textContent,
    ).toContain('target is missing');

    await input(document.querySelector('select')!, 'zh-CN');

    expect(
        document.querySelector('[data-testid="script-validation-banner"]')?.textContent,
    ).toContain('缺少 target 字段');
});

test('test_英语删除对话框_保留任务名', async () => {
    setLocale('en');
    useHttp(() => [{ id: 1, name: '任务 1', updatedAt: '2026-01-01' }]);
    await render(
        <MemoryRouter initialEntries={['/tasks']}>
            <App />
        </MemoryRouter>,
    );

    await click(button('Delete task'));

    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
        'Delete task “任务 1”?',
    );
});

test('test_英语历史记录_翻译状态和错误并保留任务名', async () => {
    setLocale('en');
    useHttp(() => ({
        list: [
            {
                id: 1,
                taskName: '中文回归',
                status: 'failed',
                model: 'vision',
                startedAt: '2026-01-01',
                durationMs: 30,
                tokenInput: 0,
                tokenOutput: 0,
                error: '任务不存在',
            },
        ],
        total: 1,
    }));

    await render(
        <MemoryRouter initialEntries={['/history']}>
            <App />
        </MemoryRouter>,
    );

    expect(document.querySelector('tbody')?.textContent).toMatch(
        /中文回归.*Failed.*Task not found/,
    );
});

test('test_设备检查未返回名称_使用已选择的设备号', async () => {
    setLocale('en');
    stubDelay(800);
    useHttp(({ path }) => {
        if (path === '/api/system/android-devices')
            return { devices: [{ id: 'dev-a', name: '手机甲' }] };
        if (path.startsWith('/api/system/android-apps')) return { apps: [] };
        return { ok: true, errors: [] };
    });
    await render(
        <MemoryRouter initialEntries={['/tasks/new']}>
            <App />
        </MemoryRouter>,
    );
    await click(button('Android'));

    await click(button('Check connection'));

    expect(latestNotice()?.title).toBe('Device dev-a is connected');
});
