export function sidebarBrand(collapsed: boolean) {
    if (collapsed) {
        return null;
    }
    return 'AI 自动化测试';
}

export function collapseButtonLabel(collapsed: boolean) {
    if (collapsed) {
        return null;
    }
    return '收起';
}

export function collapseAriaLabel(collapsed: boolean) {
    if (collapsed) {
        return '展开侧栏';
    }
    return '收起侧栏';
}

export function selectedMenuClass(selected: boolean) {
    if (selected) {
        return 'bg-sidebar-accent text-sidebar-accent-foreground';
    }
    return 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground';
}

export function collapsedMenuClass(collapsed: boolean) {
    if (!collapsed) {
        return undefined;
    }
    return 'justify-center px-2';
}

export function menuItemLabel(collapsed: boolean, label: string) {
    if (collapsed) {
        return null;
    }
    return label;
}
