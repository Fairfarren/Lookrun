import { describe, expect, test } from 'bun:test';
import {
    APP_SHELL_STYLE,
    CONTENT_STYLE,
    HEADER_STYLE,
    MAIN_LAYOUT_STYLE,
    SIDER_STYLE,
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
});
