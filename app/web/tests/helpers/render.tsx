import './dom';
import { afterEach, beforeEach } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast, type ToastT } from 'sonner';
import { ConfirmHost } from '../../src/components/confirm-host';
import { testBrowser } from './dom';

type RequestRecord = { path: string; method: string; body: unknown };
type HttpHandler = (request: RequestRecord) => unknown | Promise<unknown>;
const roots: Root[] = [];
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const cleanupCallbacks: (() => void)[] = [];

export function latestNotice() {
    return toast
        .getToasts()
        .filter((entry): entry is ToastT => 'title' in entry)
        .at(-1);
}

export function useDomTests() {
    beforeEach(() => {
        document.body.innerHTML = '';
        testBrowser.localStorage.clear();
    });
    afterEach(async () => {
        await act(async () => {
            for (const root of roots.splice(0)) root.unmount();
            toast.dismiss();
        });
        document.body.innerHTML = '';
        globalThis.fetch = originalFetch;
        globalThis.WebSocket = originalWebSocket;
        for (const cleanup of cleanupCallbacks.splice(0)) cleanup();
        await testBrowser.happyDOM.abort();
    });
}

export function useHttp(handler: HttpHandler) {
    const requests: RequestRecord[] = [];
    globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
        const path =
            typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.pathname + input.search
                  : input.url;
        const request = {
            path,
            method: options?.method ?? 'GET',
            body: options?.body ? JSON.parse(String(options.body)) : undefined,
        };
        requests.push(request);
        const body = await handler(request);
        return body instanceof Response ? body : Response.json(body);
    }) as typeof fetch;
    return requests;
}

export async function render(element: ReactNode) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(element);
    });
    return { container, root };
}

function CurrentLocation() {
    const location = useLocation();
    return <output data-testid='location'>{location.pathname}</output>;
}

export function renderPage(element: ReactNode, route: { path: string; url: string }) {
    return render(
        <MemoryRouter initialEntries={[route.url]}>
            <ConfirmHost />
            <CurrentLocation />
            <Routes>
                <Route path={route.path} element={element} />
                <Route path='*' element={<p>已离开当前页面</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

export function button(label: string) {
    const found = [...document.querySelectorAll('button')].find(
        (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
    );
    if (!found) throw new Error(`找不到按钮：${label}\n${document.body.textContent}`);
    return found;
}

export async function click(element: HTMLElement) {
    await act(async () => {
        element.click();
    });
}

export async function input(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string,
) {
    await act(async () => {
        const prototype =
            element instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : element instanceof HTMLTextAreaElement
                  ? HTMLTextAreaElement.prototype
                  : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(
            new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
        );
    });
}

export function field(placeholder: string) {
    const found = document.querySelector<HTMLInputElement>(`input[placeholder='${placeholder}']`);
    if (!found) throw new Error(`找不到输入框：${placeholder}`);
    return found;
}

export function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

export async function flush(action: () => void) {
    await act(async () => {
        action();
    });
}

export async function choose(index: number, label: string) {
    const trigger = document.querySelectorAll<HTMLElement>('[role="combobox"]')[index];
    if (!trigger) throw new Error(`找不到第 ${index + 1} 个选择框`);
    await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (item) => item.textContent === label,
    );
    if (!option) throw new Error(`找不到选项：${label}\n${document.body.textContent}`);
    await click(option);
}

export function stubWebSockets() {
    class Socket {
        static instances: Socket[] = [];
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        closed = false;
        constructor(readonly url: string) {
            Socket.instances.push(this);
        }
        receive(data: unknown) {
            this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
        }
        close() {
            this.closed = true;
            this.onclose?.();
        }
    }
    globalThis.WebSocket = Socket as unknown as typeof WebSocket;
    return Socket.instances;
}

export function stubDelay(delay: number) {
    const originalTimeout = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const pending = new Map<number, () => void>();
    let nextId = 100000;
    globalThis.setTimeout = ((callback: () => void, milliseconds?: number, ...args: unknown[]) => {
        if (milliseconds !== delay) return originalTimeout(callback, milliseconds, ...args);
        const id = nextId++;
        pending.set(id, callback);
        return id;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
        if (!pending.delete(Number(id))) originalClear(id);
    }) as typeof clearTimeout;
    cleanupCallbacks.push(() => {
        globalThis.setTimeout = originalTimeout;
        globalThis.clearTimeout = originalClear;
    });
    return () =>
        flush(() => {
            for (const [id, callback] of pending) {
                pending.delete(id);
                callback();
            }
        });
}

export async function keyboardDrag(handles: HTMLButtonElement[]) {
    handles.forEach((handle, index) => {
        // DOM 模拟器不计算布局，提供拖拽传感器所需的固定行坐标，事件和排序逻辑仍真实执行。
        const item = handle.getAttribute('aria-label')?.includes('步骤组')
            ? handle.closest('[data-slot="card"]')!
            : handle.parentElement!;
        Object.defineProperty(item, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, index * 80, 500, 70),
        });
    });
    const handle = handles[0]!;
    await flush(() => handle.focus());
    for (const code of ['Space', 'ArrowDown', 'Space']) {
        await act(async () => {
            handle.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: code === 'Space' ? ' ' : code,
                    code,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await new Promise<void>((resolve) => setImmediate(resolve));
        });
    }
}
