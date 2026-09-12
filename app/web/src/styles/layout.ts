export const APP_SHELL_CLASS = 'flex h-svh overflow-hidden bg-background text-foreground';
export const SIDER_CLASS =
    'flex h-svh shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground';
export const SIDER_EXPANDED_CLASS = 'w-[220px]';
export const SIDER_COLLAPSED_CLASS = 'w-16';
export const MAIN_LAYOUT_CLASS = 'flex min-w-0 flex-1 flex-col overflow-hidden';
export const HEADER_CLASS =
    'sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-6 text-base';
export const CONTENT_CLASS = 'min-h-0 flex-1 overflow-y-auto p-4';
export const CARD_HEADER_WRAP_CLASS = 'flex flex-wrap items-center gap-y-2';
export const CARD_ACTIONS_CLASS = 'flex flex-wrap justify-end gap-2';
export const RUN_FRAME_CLASS = 'w-full lg:w-5/12';
export const RUN_LOG_CLASS = 'w-full lg:w-7/12';
export const SIDER_COLLAPSE_BELOW = 768;
export const SIDER_WIDTH = 220;
export const SIDER_COLLAPSED_WIDTH = 64;

export function siderCollapsed(viewportWidth: number) {
    return viewportWidth < SIDER_COLLAPSE_BELOW;
}

export function siderWidthClass(collapsed: boolean) {
    if (collapsed) {
        return SIDER_COLLAPSED_CLASS;
    }
    return SIDER_EXPANDED_CLASS;
}
