import { createContext, useContext } from 'react';
import type { ThemeMode } from './theme';

export const ThemeModeContext = createContext<ThemeMode>('light');

export function useThemeMode() {
    return useContext(ThemeModeContext);
}
