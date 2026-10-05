import './helpers/dom';
import { expect, test } from 'bun:test';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { getLocale, LOCALE_STORAGE_KEY, setLocale, t, useLocale } from '../src/i18n';
import { flush, input, render, useDomTests, useHttp } from './helpers/render';

useDomTests();

test('test_首次打开_默认英语', () => {
    window.localStorage.clear();

    const locale = getLocale();

    expect(locale).toBe('en');
});

test('test_未知语言设置_回退英语', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');

    const locale = getLocale();

    expect(locale).toBe('en');
});

test('test_保存中文_后续读取中文', () => {
    setLocale('zh-CN');

    const locale = getLocale();

    expect(locale).toBe('zh-CN');
});

test('test_中文文案_原样返回', () => {
    setLocale('zh-CN');

    const message = t('任务');

    expect(message).toBe('任务');
});

test('test_英语文案_读取翻译', () => {
    setLocale('en');

    const message = t('任务');

    expect(message).toBe('Tasks');
});

test('test_用户内容_保持原样', () => {
    setLocale('en');

    const message = t('用户自定义的步骤名称');

    expect(message).toBe('用户自定义的步骤名称');
});

test.each(['constructor', 'toString', '__proto__'])(
    'test_内置对象属性名_原样返回_%s',
    (message) => {
        setLocale('en');

        const result = t(message);

        expect(result).toBe(message);
    },
);

test('test_文案插值_保留零值', () => {
    const message = t('{count} / {name}', { count: 0, name: '测试' });

    expect(message).toBe('0 / 测试');
});

test('test_缺少插值_保留占位符', () => {
    const message = t('{count} / {{USERNAME}}', {});

    expect(message).toBe('{count} / {{USERNAME}}');
});

test('test_未提供插值_保留占位符', () => {
    const message = t('{count}');

    expect(message).toBe('{count}');
});

test('test_本地存储禁用_仍可切换', () => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem() {
                throw new Error('本地存储已禁用');
            },
            setItem() {
                throw new Error('本地存储已禁用');
            },
        },
    });
    try {
        setLocale('zh-CN');

        expect(getLocale()).toBe('zh-CN');
    } finally {
        Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
        setLocale('zh-CN');
    }
});

test('test_本地存储只能读取_切换覆盖旧选择', () => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem() {
                return 'zh-CN';
            },
            setItem() {
                throw new Error('本地存储不可写');
            },
        },
    });
    try {
        setLocale('en');

        expect(getLocale()).toBe('en');
    } finally {
        Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
        setLocale('zh-CN');
    }
});

test('test_本地存储读取失败_默认英语', () => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('本地存储不可读');
        },
    });
    try {
        const locale = getLocale();

        expect(locale).toBe('en');
    } finally {
        Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    }
});

test('test_其他标签页更新语言_界面同步', async () => {
    function Language() {
        return <output>{useLocale()}</output>;
    }
    await render(<Language />);

    await flush(() => {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
        window.dispatchEvent(new Event('storage'));
    });

    expect(document.querySelector('output')?.textContent).toBe('en');
});

test('test_顶栏切换中文_更新导航和文档语言', async () => {
    window.localStorage.clear();
    useHttp(() => []);
    await render(
        <MemoryRouter initialEntries={['/tasks']}>
            <App />
        </MemoryRouter>,
    );

    await input(document.querySelector('select')!, 'zh-CN');

    expect({
        locale: document.documentElement.lang,
        title: document.title,
        navigation: document.querySelector('nav')?.textContent,
        stored: window.localStorage.getItem(LOCALE_STORAGE_KEY),
    }).toEqual({
        locale: 'zh-CN',
        title: 'AI 自动化测试',
        navigation: '任务队列实时运行历史记录设置',
        stored: 'zh-CN',
    });
});

test('test_已保存中文_重新挂载保持选择', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    useHttp(() => []);

    await render(
        <MemoryRouter initialEntries={['/tasks']}>
            <App />
        </MemoryRouter>,
    );

    expect(document.querySelector('select')?.value).toBe('zh-CN');
});
