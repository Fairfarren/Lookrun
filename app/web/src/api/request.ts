import { getLocale, t } from '../i18n';
import { translateError } from '../i18n/errors';
export function jsonRequestHeaders(hasBody: boolean) {
    if (!hasBody) {
        return undefined;
    }
    return { 'Content-Type': 'application/json' };
}

export function requestErrorText(body: { error?: string; errors?: string[] }, status: number) {
    if (body.errors && body.errors.length > 0) {
        return body.errors.map(translateError).join(getLocale() === 'zh-CN' ? '；' : '; ');
    }
    if (body.error) {
        return translateError(body.error);
    }
    return t('请求失败（{p0}）', { p0: status });
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        headers: jsonRequestHeaders(Boolean(options?.body)),
        ...options,
    });
    const body = (await response.json()) as T & {
        error?: string;
        errors?: string[];
    };
    if (!response.ok) {
        throw new Error(requestErrorText(body, response.status));
    }
    return body;
}
