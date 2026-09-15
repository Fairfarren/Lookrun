import { describe, expect, test } from 'bun:test';
import {
    activatePageSession,
    pageSessionKey,
    resolvePageSessionAction,
} from '@server/lib/page-session';

describe('pageSessionKey', () => {
    test('去掉首尾空格后作为页面身份', () => {
        expect(pageSessionKey(' https://h5.example.com/login ')).toBe(
            pageSessionKey('https://h5.example.com/login'),
        );
    });

    test('根路径有无结尾斜杠视为同一页面', () => {
        expect(pageSessionKey('https://h5.example.com')).toBe(
            pageSessionKey('https://h5.example.com/'),
        );
    });

    test('hash 不参与页面身份，避免 SPA 跳转被当成新页面', () => {
        expect(pageSessionKey('https://h5.example.com/#/login')).toBe(
            pageSessionKey('https://h5.example.com/#/verify'),
        );
    });
});

describe('resolvePageSessionAction', () => {
    test('未填写 url 时留在当前页', () => {
        expect(
            resolvePageSessionAction(undefined, 'https://h5.example.com', [
                'https://h5.example.com',
            ]),
        ).toEqual({ type: 'stay' });
    });

    test('空字符串 url 时留在当前页', () => {
        expect(
            resolvePageSessionAction('  ', 'https://h5.example.com', ['https://h5.example.com']),
        ).toEqual({ type: 'stay' });
    });

    test('填写当前页同一地址时不重新打开', () => {
        const current = pageSessionKey('https://h5.example.com/');
        expect(resolvePageSessionAction('https://h5.example.com', current, [current])).toEqual({
            type: 'stay',
        });
    });

    test('填写已打开过的其他地址时复用', () => {
        const h5 = pageSessionKey('https://h5.example.com');
        const admin = pageSessionKey('https://admin.example.com');
        expect(resolvePageSessionAction('https://h5.example.com/', admin, [h5, admin])).toEqual({
            type: 'reuse',
            key: h5,
        });
    });

    test('填写从未打开过的地址时新开', () => {
        const h5 = pageSessionKey('https://h5.example.com');
        expect(resolvePageSessionAction('https://admin.example.com', h5, [h5])).toEqual({
            type: 'open',
            key: pageSessionKey('https://admin.example.com'),
            url: 'https://admin.example.com',
        });
    });
});

describe('activatePageSession', () => {
    test('先打开 H5 再打开后台再回到 H5 时复用已打开的 H5', async () => {
        const sessions = new Map<string, { id: number }>();
        const opened: string[] = [];
        let nextId = 0;
        const open = async (url: string) => {
            opened.push(url);
            nextId += 1;
            return { id: nextId };
        };

        const h5 = 'https://h5.example.com/login';
        const admin = 'https://admin.example.com/sms';

        const first = await activatePageSession({
            requestedUrl: h5,
            currentKey: null,
            sessions,
            open,
        });
        const second = await activatePageSession({
            requestedUrl: admin,
            currentKey: first.key,
            sessions,
            open,
        });
        const third = await activatePageSession({
            requestedUrl: h5,
            currentKey: second.key,
            sessions,
            open,
        });

        expect(opened).toEqual([h5, admin]);
        expect(third.session.id).toBe(first.session.id);
        expect(third.key).toBe(first.key);
        expect(second.session.id).not.toBe(first.session.id);
    });

    test('未填写 url 时继续使用当前页面', async () => {
        const sessions = new Map<string, { id: number }>();
        const first = await activatePageSession({
            requestedUrl: 'https://h5.example.com',
            currentKey: null,
            sessions,
            open: async () => ({ id: 1 }),
        });

        const next = await activatePageSession({
            requestedUrl: undefined,
            currentKey: first.key,
            sessions,
            open: async () => ({ id: 2 }),
        });

        expect(next.session.id).toBe(1);
        expect(next.key).toBe(first.key);
    });
});
