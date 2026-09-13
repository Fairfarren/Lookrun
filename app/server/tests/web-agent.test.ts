import { describe, expect, test } from 'bun:test';
import {
    canDirectNavigate,
    DIRECT_NAVIGATE_ACTION,
    offSiteNavigateError,
    restrictDirectNavigate,
    restrictDirectNavigateFromAgent,
    searchOnOpenedPageContext,
    siteKey,
} from '../src/lib/web-agent';

describe('siteKey', () => {
    test('去掉 www 后按主域识别站点', () => {
        expect(siteKey('https://www.bing.com/')).toBe('bing.com');
        expect(siteKey('https://bing.com/search?q=baidu')).toBe('bing.com');
    });

    test('同一主域的不同子域视为同一站点', () => {
        expect(siteKey('https://www.baidu.com/')).toBe(siteKey('https://global.baidu.com/'));
    });

    test('非法地址得到空站点', () => {
        expect(siteKey('not-a-url')).toBe('');
    });
});

describe('canDirectNavigate', () => {
    test('允许跳到已打开站点的搜索结果页', () => {
        expect(
            canDirectNavigate('https://www.bing.com/', 'https://www.bing.com/search?q=baidu'),
        ).toBe(true);
    });

    test('禁止从步骤组页面直接打开其他搜索引擎', () => {
        expect(canDirectNavigate('https://www.baidu.com/', 'https://www.google.com/')).toBe(false);
    });

    test('目标地址非法时禁止跳转', () => {
        expect(canDirectNavigate('https://www.baidu.com/', '')).toBe(false);
    });
});

describe('restrictDirectNavigate', () => {
    test('同站跳转仍交给原来的 Navigate', async () => {
        const opened: string[] = [];
        const actions = [
            {
                name: DIRECT_NAVIGATE_ACTION,
                call: async (param: { url?: string }) => {
                    opened.push(String(param.url));
                },
            },
        ];

        restrictDirectNavigate(actions, 'https://www.bing.com/');
        await actions[0].call({ url: 'https://www.bing.com/search?q=baidu' });

        expect(opened).toEqual(['https://www.bing.com/search?q=baidu']);
    });

    test('跨站跳转直接失败，避免绕过已打开的页面', async () => {
        const actions = [
            {
                name: DIRECT_NAVIGATE_ACTION,
                call: async (_param: { url?: string }) => {},
            },
        ];
        restrictDirectNavigate(actions, 'https://www.baidu.com/');

        await expect(actions[0].call({ url: 'https://www.google.com/' })).rejects.toThrow(
            offSiteNavigateError('https://www.baidu.com/', 'https://www.google.com/'),
        );
    });
});

describe('restrictDirectNavigateFromAgent', () => {
    test('只包装 Agent 动作空间里的 Navigate', async () => {
        const opened: string[] = [];
        const actions = [
            { name: 'Tap', call: async (_param: { url?: string }) => {} },
            {
                name: DIRECT_NAVIGATE_ACTION,
                call: async (param: { url?: string }) => {
                    opened.push(String(param.url));
                },
            },
        ];

        await restrictDirectNavigateFromAgent(
            { getActionSpace: async () => actions },
            'https://www.baidu.com/',
        );
        await expect(actions[1].call({ url: 'https://www.google.com/' })).rejects.toThrow(
            'google.com',
        );
        await actions[1].call({ url: 'https://www.baidu.com/s?wd=google' });
        expect(opened).toEqual(['https://www.baidu.com/s?wd=google']);
    });
});

describe('searchOnOpenedPageContext', () => {
    test('把已打开的页面地址写进自由指令上下文', () => {
        const context = searchOnOpenedPageContext('https://www.baidu.com/');
        expect(context).toContain('https://www.baidu.com/');
        expect(context).toContain('搜索请使用这个页面上的搜索框');
    });
});
