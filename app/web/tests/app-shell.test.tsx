import './helpers/dom';
import { expect, test } from 'bun:test';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { THEME_STORAGE_KEY } from '../src/theme';
import { button, click, flush, render, useDomTests, useHttp } from './helpers/render';

useDomTests();

test('应用默认进入任务页，导航队列后标题与实际页面一起更新', async () => {
    useHttp(({ path }) => (path === '/api/tasks' ? [] : { items: [] }));
    await render(
        <MemoryRouter initialEntries={['/']}>
            <App />
        </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="app-content"]')?.textContent).toContain(
        '任务列表',
    );

    await click(document.querySelector<HTMLAnchorElement>('a[href="/queues"]')!);

    expect({
        header: document.querySelector('[data-testid="app-header"]')?.textContent,
        content: document.querySelector('[data-testid="app-content"]')?.textContent,
    }).toEqual({ header: '队列', content: expect.stringContaining('队列列表') });
});

test('侧栏随窗口断点折叠，用户可手动展开，主内容仍可访问', async () => {
    useHttp(() => []);
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1280,
    });
    await render(
        <MemoryRouter initialEntries={['/tasks']}>
            <App />
        </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="app-sidebar"]')?.textContent).toContain(
        'AI 自动化测试',
    );

    await flush(() => {
        window.innerWidth = 390;
        window.dispatchEvent(new Event('resize'));
    });
    expect(document.querySelector('[data-testid="app-sidebar"]')?.textContent).not.toContain(
        'AI 自动化测试',
    );
    await click(button('展开侧栏'));
    expect(document.querySelector('[data-testid="app-sidebar"]')?.textContent).toContain(
        'AI 自动化测试',
    );
    await click(button('收起侧栏'));

    expect({
        links: document.querySelectorAll('nav a').length,
        content: document.querySelector('main')?.textContent,
    }).toEqual({ links: 5, content: expect.stringContaining('任务列表') });
});

test('主题读取本地设置，用户切换会同步 DOM 和持久化值', async () => {
    useHttp(() => []);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    await render(
        <MemoryRouter initialEntries={['/tasks']}>
            <App />
        </MemoryRouter>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await click(button('黑夜模式'));

    expect({
        dark: document.documentElement.classList.contains('dark'),
        scheme: document.documentElement.style.colorScheme,
        stored: window.localStorage.getItem(THEME_STORAGE_KEY),
    }).toEqual({ dark: false, scheme: 'light', stored: 'light' });
});
