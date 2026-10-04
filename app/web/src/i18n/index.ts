import { useSyncExternalStore } from 'react';
import { englishMessages } from './messages';

export type Locale = 'en' | 'zh-CN';
export const LOCALE_STORAGE_KEY = 'lookrun-language';
const LOCALE_EVENT = 'lookrun-language-change';
let fallbackLocale: Locale = 'en';

export function getLocale(): Locale {
    try {
        return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'zh-CN' ? 'zh-CN' : 'en';
    } catch {
        return fallbackLocale;
    }
}

export function setLocale(locale: Locale) {
    fallbackLocale = locale;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // 禁用本地存储时，仍允许在当前页面切换语言。
    }
    window.dispatchEvent(new Event(LOCALE_EVENT));
}

function subscribe(onChange: () => void) {
    window.addEventListener(LOCALE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(LOCALE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

export function useLocale() {
    return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export function t(message: string, values?: Record<string, string | number>) {
    const translated = getLocale() === 'zh-CN' ? message : (englishMessages[message] ?? message);
    return translated.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        String(values?.[name] ?? placeholder),
    );
}
