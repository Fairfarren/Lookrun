export type PageSessionAction =
	| { type: "stay" }
	| { type: "reuse"; key: string }
	| { type: "open"; key: string; url: string };

// 用配置里的入口地址作为页面身份，而不是浏览器当前地址。
// H5 发验证码后 URL 可能变成 hash 路由，回来时仍要找到原来那一页。
export function pageSessionKey(url: string) {
	const parsed = new URL(url.trim());
	parsed.hash = "";
	const path = parsed.pathname.replace(/\/$/, "");
	return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
}

export function resolvePageSessionAction(
	requestedUrl: string | undefined,
	currentKey: string | null,
	openedKeys: Iterable<string>,
): PageSessionAction {
	const url = requestedUrl?.trim() ?? "";
	if (url === "") {
		return { type: "stay" };
	}
	const key = pageSessionKey(url);
	if (currentKey === key) {
		return { type: "stay" };
	}
	for (const opened of openedKeys) {
		if (opened === key) {
			return { type: "reuse", key };
		}
	}
	return { type: "open", key, url };
}

export async function activatePageSession<T>(input: {
	requestedUrl: string | undefined;
	currentKey: string | null;
	sessions: Map<string, T>;
	open: (url: string) => Promise<T>;
}) {
	const action = resolvePageSessionAction(
		input.requestedUrl,
		input.currentKey,
		input.sessions.keys(),
	);
	if (action.type === "stay") {
		if (input.currentKey === null) {
			throw new Error("当前没有已打开的页面");
		}
		const session = input.sessions.get(input.currentKey);
		if (!session) {
			throw new Error(`找不到已打开的页面：${input.currentKey}`);
		}
		return { key: input.currentKey, session, didOpen: false };
	}
	if (action.type === "reuse") {
		const session = input.sessions.get(action.key);
		if (!session) {
			throw new Error(`找不到已打开的页面：${action.key}`);
		}
		return { key: action.key, session, didOpen: false };
	}
	const session = await input.open(action.url);
	input.sessions.set(action.key, session);
	return { key: action.key, session, didOpen: true };
}
