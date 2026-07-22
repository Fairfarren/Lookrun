export const THEME_STORAGE_KEY = "theme-mode";

export type ThemeMode = "light" | "dark";

interface ThemeStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function getStoredTheme(storage: ThemeStorage): ThemeMode {
	return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function setStoredTheme(storage: ThemeStorage, themeMode: ThemeMode) {
	storage.setItem(THEME_STORAGE_KEY, themeMode);
}
