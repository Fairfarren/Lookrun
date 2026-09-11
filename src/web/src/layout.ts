import type { CSSProperties } from 'react';

export const APP_SHELL_STYLE = {
    height: '100vh',
    overflow: 'hidden',
} satisfies CSSProperties;

export const SIDER_STYLE = {
    height: '100vh',
    overflowY: 'auto',
} satisfies CSSProperties;

export const MAIN_LAYOUT_STYLE = {
    height: '100vh',
    minWidth: 0,
    overflow: 'hidden',
} satisfies CSSProperties;

export const HEADER_STYLE = {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    flex: 'none',
} satisfies CSSProperties;

export const CONTENT_STYLE = {
    margin: 16,
    minHeight: 0,
    overflowY: 'auto',
} satisfies CSSProperties;

export const SIDER_COLLAPSE_BELOW = 768;
export const SIDER_WIDTH = 220;
export const SIDER_COLLAPSED_WIDTH = 64;

export function siderCollapsed(viewportWidth: number) {
    return viewportWidth < SIDER_COLLAPSE_BELOW;
}

export const CARD_HEADER_WRAP_STYLE = {
    flexWrap: 'wrap',
    rowGap: 8,
} satisfies CSSProperties;

export const CARD_ACTIONS_STYLE = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
} satisfies CSSProperties;

export const RUN_FRAME_COL = { xs: 24, lg: 10 };
export const RUN_LOG_COL = { xs: 24, lg: 14 };
