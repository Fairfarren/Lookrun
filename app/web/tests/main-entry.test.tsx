import './helpers/dom';
import { expect, test } from 'bun:test';
import { act } from 'react';
import { useDomTests, useHttp } from './helpers/render';

useDomTests();

test('真实浏览器入口挂载应用并重定向到任务页', async () => {
    useHttp(() => []);
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    window.history.replaceState(null, '', '/');
    let app: typeof import('../src/main');
    await act(async () => {
        app = await import('../src/main');
    });
    try {
        expect({
            path: window.location.pathname,
            content: document.querySelector('main')?.textContent,
        }).toEqual({ path: '/tasks', content: expect.stringContaining('任务列表') });
    } finally {
        await act(async () => {
            app!.root.unmount();
        });
    }
});
