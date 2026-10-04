import { describe, expect, test } from 'bun:test';
import {
    SIDER_COLLAPSE_BELOW,
    SIDER_COLLAPSED_CLASS,
    SIDER_EXPANDED_CLASS,
    siderCollapsed,
    siderWidthClass,
} from '../src/styles/layout';

describe('侧栏断点', () => {
    test('窄于断点时收起', () => {
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW - 1)).toBe(true);
    });
    test('达到断点时展开', () => {
        expect(siderCollapsed(SIDER_COLLAPSE_BELOW)).toBe(false);
    });
    test('宽度样式与收起状态一致', () => {
        expect([siderWidthClass(true), siderWidthClass(false)]).toEqual([
            SIDER_COLLAPSED_CLASS,
            SIDER_EXPANDED_CLASS,
        ]);
    });
});
