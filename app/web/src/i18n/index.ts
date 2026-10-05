import { useSyncExternalStore } from 'react';
import { englishMessages } from './messages';

export type Locale = 'en' | 'zh-CN';
export const LOCALE_STORAGE_KEY = 'lookrun-language';
const LOCALE_EVENT = 'lookrun-language-change';
let temporaryLocale: Locale | null = null;

export function getLocale(): Locale {
    if (temporaryLocale !== null) return temporaryLocale;
    try {
        return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'zh-CN' ? 'zh-CN' : 'en';
    } catch {
        return 'en';
    }
}

export function setLocale(locale: Locale) {
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        temporaryLocale = null;
    } catch {
        // 禁用本地存储时，仍允许在当前页面切换语言。
        temporaryLocale = locale;
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
    const translated =
        getLocale() === 'en' && Object.hasOwn(englishMessages, message)
            ? englishMessages[message]!
            : message;
    return translated.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        String(values?.[name] ?? placeholder),
    );
}
