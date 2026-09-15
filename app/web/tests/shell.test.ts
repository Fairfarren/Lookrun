import { expect, test } from 'bun:test';
import {
    collapseAriaLabel,
    collapseButtonLabel,
    collapsedMenuClass,
    menuItemLabel,
    selectedMenuClass,
    sidebarBrand,
} from '@/utils/shell';
import {
    androidCheckError,
    fieldLabelText,
    isBusyDisabled,
    launchFieldPlaceholder,
    modelCheckVariant,
    optionalIdString,
    pageCardHasHeader,
    resolvedToggleVariant,
    scrollBarOrientationClass,
    selectPopperOffsetClass,
    selectPopperViewportClass,
    stayOnTasks,
} from '@/utils/ui-class';

test('侧栏文案在收起时隐藏', () => {
    expect(sidebarBrand(true)).toBeNull();
    expect(sidebarBrand(false)).toBe('AI 自动化测试');
});

test('收起按钮文案与无障碍标签', () => {
    expect(collapseButtonLabel(true)).toBeNull();
    expect(collapseButtonLabel(false)).toBe('收起');
    expect(collapseAriaLabel(true)).toBe('展开侧栏');
    expect(collapseAriaLabel(false)).toBe('收起侧栏');
});

test('菜单选中与收起 class', () => {
    expect(selectedMenuClass(true)).toContain('bg-sidebar-accent');
    expect(selectedMenuClass(false)).toContain('text-sidebar-foreground/80');
    expect(collapsedMenuClass(true)).toBe('justify-center px-2');
    expect(collapsedMenuClass(false)).toBeUndefined();
    expect(menuItemLabel(true, '任务')).toBeNull();
    expect(menuItemLabel(false, '任务')).toBe('任务');
});

test('忙碌按钮禁用条件', () => {
    expect(isBusyDisabled(true, false)).toBe(true);
    expect(isBusyDisabled(false, true)).toBe(true);
    expect(isBusyDisabled(false, false)).toBe(false);
});

test('卡片是否显示标题栏', () => {
    expect(pageCardHasHeader(false, false)).toBe(false);
    expect(pageCardHasHeader(true, false)).toBe(true);
    expect(pageCardHasHeader(false, true)).toBe(true);
});

test('滚动条与下拉定位 class', () => {
    expect(scrollBarOrientationClass('horizontal')).toContain('h-2.5');
    expect(scrollBarOrientationClass('vertical')).toContain('h-full');
    expect(selectPopperOffsetClass('item-aligned')).toBeUndefined();
    expect(selectPopperOffsetClass('popper')).toContain('translate-y-1');
    expect(selectPopperViewportClass('item-aligned')).toBeUndefined();
    expect(selectPopperViewportClass('popper')).toContain('radix-select-trigger-height');
});

test('Toggle 变体优先用上下文', () => {
    expect(resolvedToggleVariant('outline', 'default')).toBe('outline');
    expect(resolvedToggleVariant(undefined, 'default')).toBe('default');
});

test('可选数字 id 转字符串', () => {
    expect(optionalIdString(undefined)).toBeUndefined();
    expect(optionalIdString(3)).toBe('3');
});

test('排队成功时留在任务页', () => {
    expect(stayOnTasks({ stay: true, message: '已加入队列' })).toBe(true);
    expect(stayOnTasks({ stay: true, message: null })).toBe(false);
    expect(stayOnTasks({ stay: false, message: null })).toBe(false);
});

test('Android 检查失败文案', () => {
    expect(androidCheckError('离线')).toBe('离线');
    expect(androidCheckError()).toBe('检查失败');
});

test('启动应用输入占位符', () => {
    expect(launchFieldPlaceholder(true, '应用', '读取中')).toBe('读取中');
    expect(launchFieldPlaceholder(false, '应用', '读取中')).toBe('应用');
    expect(fieldLabelText(undefined, '标签')).toBe('标签');
    expect(fieldLabelText('提示', '标签')).toBe('提示');
});

test('模型自检提示色', () => {
    expect(modelCheckVariant(true)).toBe('success');
    expect(modelCheckVariant(false)).toBe('destructive');
});
