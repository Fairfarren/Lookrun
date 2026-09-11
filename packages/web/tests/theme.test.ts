import { expect, test } from 'bun:test';
import { getStoredTheme, setStoredTheme, THEME_STORAGE_KEY } from '../src/theme';

function createStorage(initialValue: string | null) {
    let value = initialValue;

    return {
        getItem(key: string) {
            return key === THEME_STORAGE_KEY ? value : null;
        },
        setItem(key: string, nextValue: string) {
            if (key === THEME_STORAGE_KEY) {
                value = nextValue;
            }
        },
    };
}

test('已保存暗色主题时返回暗色', () => {
    const storage = createStorage('dark');

    const result = getStoredTheme(storage);

    expect(result).toBe('dark');
});

test('没有保存主题时返回亮色', () => {
    const storage = createStorage(null);

    const result = getStoredTheme(storage);

    expect(result).toBe('light');
});

test('保存值无效时返回亮色', () => {
    const storage = createStorage('unknown');

    const result = getStoredTheme(storage);

    expect(result).toBe('light');
});

test('切换主题时保存新值', () => {
    const storage = createStorage(null);

    setStoredTheme(storage, 'dark');

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
});
