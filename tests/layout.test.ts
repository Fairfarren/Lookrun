import { describe, expect, test } from 'bun:test';
import {
    APP_SHELL_STYLE,
    CARD_ACTIONS_STYLE,
    CARD_HEADER_WRAP_STYLE,
    RUN_FRAME_COL,
    RUN_LOG_COL,
    CONTENT_STYLE,
    HEADER_STYLE,
    MAIN_LAYOUT_STYLE,
    SIDER_COLLAPSE_BELOW,
    SIDER_STYLE,
    siderCollapsed,
} from '../src/web/src/layout';

describe('应用布局', () => {
    test('应用壳限制在视口内且不产生全局滚动', () => {
        expect(APP_SHELL_STYLE).toEqual({
            height: '100vh',
            overflow: 'hidden',
        });
    });

    test('左侧导航固定在视口高度内', () => {
        expect(SIDER_STYLE).toEqual({
            height: '100vh',
            overflowY: 'auto',
        });
    });

    test('右侧布局不把滚动传递给页面', () => {
        expect(MAIN_LAYOUT_STYLE).toEqual({
            height: '100vh',
            minWidth: 0,
            overflow: 'hidden',
        });
    });

    test('顶部标题栏保持吸顶', () => {
        expect(HEADER_STYLE).toEqual({
            position: 'sticky',
            top: 0,
            zIndex: 1,
            flex: 'none',
        });
    });

    test('右侧内容区域独立滚动', () => {
        expect(CONTENT_STYLE).toEqual({
            margin: 16,
            minHeight: 0,
            overflowY: 'auto',
        });
    });

    test('窄于 768 时侧栏应收起', () => {
        expect(siderCollapsed(390)).toBe(true);
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW - 1)).toBe(true);
    });

    test('达到 768 时侧栏展开', () => {
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW)).toBe(false);
        expect(siderCollapsed(1280)).toBe(false);
    });

    test('卡片标题和操作区允许换行以免窄屏把保存挤出视口', () => {
        expect(CARD_HEADER_WRAP_STYLE.flexWrap).toBe('wrap');
        expect(CARD_ACTIONS_STYLE.flexWrap).toBe('wrap');
    });

    test('实时运行页在窄屏上画面和日志上下排列', () => {
        expect(RUN_FRAME_COL.xs).toBe(24);
        expect(RUN_LOG_COL.xs).toBe(24);
        expect(RUN_FRAME_COL.lg + RUN_LOG_COL.lg).toBe(24);
    });
});
