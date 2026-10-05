import { t } from '../i18n';

const MENU_PATHS = ['/tasks', '/queues', '/run', '/history', '/settings'];

export function selectedMenuKey(pathname: string) {
    const match = MENU_PATHS.find((key) => pathname.startsWith(key));
    if (match) {
        return match;
    }
    return '/tasks';
}

export function themeSwitchTitle(themeMode: string) {
    if (themeMode === 'dark') {
        return t('切换到亮色模式');
    }
    return t('切换到黑夜模式');
}

export function themeFromSwitch(checked: boolean) {
    if (checked) {
        return 'dark';
    }
    return 'light';
}
