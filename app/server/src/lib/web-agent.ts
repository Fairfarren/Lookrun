export const DIRECT_NAVIGATE_ACTION = 'Navigate';

export type ActionSpaceItem = {
    name?: string;
    call?: (param: { url?: string }, context?: unknown) => Promise<unknown> | unknown;
};

export function siteKey(url: string) {
    try {
        return registrableHost(new URL(url).hostname);
    } catch {
        return '';
    }
}

function registrableHost(hostname: string) {
    const host = hostname.replace(/^www\./, '');
    const parts = host.split('.').filter((part) => part !== '');
    if (parts.length < 2) {
        return host;
    }
    return parts.slice(-2).join('.');
}

export function canDirectNavigate(openedUrl: string, destUrl: string) {
    const opened = siteKey(openedUrl);
    if (opened === '') {
        return false;
    }
    const dest = siteKey(destUrl);
    if (dest === '') {
        return false;
    }
    return opened === dest;
}

export function offSiteNavigateError(openedUrl: string, destUrl: string) {
    return `只能在当前站点（${siteKey(openedUrl)}）内跳转，不能直接打开 ${destUrl}`;
}

export function restrictDirectNavigate(actions: ActionSpaceItem[], openedUrl: string) {
    for (const action of actions) {
        if (action.name === DIRECT_NAVIGATE_ACTION) {
            wrapNavigateCall(action, openedUrl);
        }
    }
}

function wrapNavigateCall(action: ActionSpaceItem, openedUrl: string) {
    const original = action.call;
    if (!original) {
        return;
    }
    action.call = async (param, context) => {
        const destUrl = String(param?.url ?? '');
        if (!canDirectNavigate(openedUrl, destUrl)) {
            throw new Error(offSiteNavigateError(openedUrl, destUrl));
        }
        return original(param, context);
    };
}

export async function restrictDirectNavigateFromAgent(
    agent: { getActionSpace: () => Promise<ActionSpaceItem[]> },
    openedUrl: string,
) {
    restrictDirectNavigate(await agent.getActionSpace(), openedUrl);
}

export function searchOnOpenedPageContext(url: string) {
    return `当前页面已打开：${url}。搜索请使用这个页面上的搜索框；需要进入结果时点击页面上的链接，不要直接打开其他搜索引擎。`;
}
