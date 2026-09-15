import { describe, expect, test } from 'bun:test';
import {
    APP_SHELL_CLASS,
    CARD_ACTIONS_CLASS,
    CARD_HEADER_WRAP_CLASS,
    CONTENT_CLASS,
    HEADER_CLASS,
    MAIN_LAYOUT_CLASS,
    RUN_FRAME_CLASS,
    RUN_LOG_CLASS,
    SIDER_CLASS,
    SIDER_COLLAPSE_BELOW,
    SIDER_COLLAPSED_CLASS,
    SIDER_EXPANDED_CLASS,
    siderCollapsed,
    siderWidthClass,
} from '@/styles/layout';

describe('应用布局', () => {
    test('应用壳限制在视口内且不产生全局滚动', () => {
        expect(APP_SHELL_CLASS).toContain('h-svh');
        expect(APP_SHELL_CLASS).toContain('overflow-hidden');
    });

    test('左侧导航固定在视口高度内', () => {
        expect(SIDER_CLASS).toContain('h-svh');
        expect(SIDER_CLASS).toContain('overflow-y-auto');
    });

    test('右侧布局不把滚动传递给页面', () => {
        expect(MAIN_LAYOUT_CLASS).toContain('overflow-hidden');
        expect(MAIN_LAYOUT_CLASS).toContain('min-w-0');
    });

    test('顶部标题栏保持吸顶', () => {
        expect(HEADER_CLASS).toContain('sticky');
        expect(HEADER_CLASS).toContain('top-0');
    });

    test('右侧内容区域独立滚动', () => {
        expect(CONTENT_CLASS).toContain('overflow-y-auto');
        expect(CONTENT_CLASS).toContain('min-h-0');
    });

    test('窄于 768 时侧栏应收起', () => {
        expect(siderCollapsed(390)).toBe(true);
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW - 1)).toBe(true);
    });

    test('达到 768 时侧栏展开', () => {
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW)).toBe(false);
        expect(siderCollapsed(1280)).toBe(false);
    });

    test('收起时用窄宽度 class', () => {
        expect(siderWidthClass(true)).toBe(SIDER_COLLAPSED_CLASS);
        expect(siderWidthClass(false)).toBe(SIDER_EXPANDED_CLASS);
    });

    test('卡片标题和操作区允许换行以免窄屏把保存挤出视口', () => {
        expect(CARD_HEADER_WRAP_CLASS).toContain('flex-wrap');
        expect(CARD_ACTIONS_CLASS).toContain('flex-wrap');
    });

    test('实时运行页在窄屏上画面和日志上下排列', () => {
        expect(RUN_FRAME_CLASS).toContain('w-full');
        expect(RUN_LOG_CLASS).toContain('w-full');
        expect(RUN_FRAME_CLASS).toContain('lg:w-5/12');
        expect(RUN_LOG_CLASS).toContain('lg:w-7/12');
    });
});
