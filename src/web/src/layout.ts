import type { CSSProperties } from "react";

export const APP_SHELL_STYLE = {
	height: "100vh",
	overflow: "hidden",
} satisfies CSSProperties;

export const SIDER_STYLE = {
	height: "100vh",
	overflowY: "auto",
} satisfies CSSProperties;

export const MAIN_LAYOUT_STYLE = {
	height: "100vh",
	minWidth: 0,
	overflow: "hidden",
} satisfies CSSProperties;

export const HEADER_STYLE = {
	position: "sticky",
	top: 0,
	zIndex: 1,
	flex: "none",
} satisfies CSSProperties;

export const CONTENT_STYLE = {
	margin: 16,
	minHeight: 0,
	overflowY: "auto",
} satisfies CSSProperties;
