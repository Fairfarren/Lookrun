import {
    ClipboardList,
    History,
    ListOrdered,
    Moon,
    PanelLeft,
    PlayCircle,
    Settings,
    Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConfirmHost } from './components/confirm-host';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { Switch } from './components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { cn } from './lib/utils';
import { AppRoutes } from './routes';
import {
    APP_SHELL_CLASS,
    CONTENT_CLASS,
    HEADER_CLASS,
    MAIN_LAYOUT_CLASS,
    SIDER_CLASS,
    siderCollapsed,
    siderWidthClass,
} from './styles/layout';
import { getStoredTheme, setStoredTheme, type ThemeMode } from './theme';
import { ThemeModeContext } from './theme/context';
import { selectedMenuKey, themeFromSwitch, themeSwitchTitle } from './utils/menu-key';
import {
    collapseAriaLabel,
    collapseButtonLabel,
    collapsedMenuClass,
    menuItemLabel,
    selectedMenuClass,
    sidebarBrand,
} from './utils/shell';

const menuItems = [
    { key: '/tasks', icon: ClipboardList, label: '任务' },
    { key: '/queues', icon: ListOrdered, label: '队列' },
    { key: '/run', icon: PlayCircle, label: '实时运行' },
    { key: '/history', icon: History, label: '历史记录' },
    { key: '/settings', icon: Settings, label: '设置' },
];

const PAGE_TITLES: Record<string, string> = {
    '/tasks': '任务',
    '/queues': '队列',
    '/run': '实时运行',
    '/history': '历史记录',
    '/settings': '设置',
};

function applyThemeClass(themeMode: ThemeMode) {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.style.colorScheme = themeMode;
}

function AppContent({
    themeMode,
    onThemeChange,
}: {
    themeMode: ThemeMode;
    onThemeChange: (themeMode: ThemeMode) => void;
}) {
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(() => siderCollapsed(window.innerWidth));
    const selectedKey = selectedMenuKey(location.pathname);

    useEffect(() => {
        const onResize = () => setCollapsed(siderCollapsed(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
        <ThemeModeContext.Provider value={themeMode}>
            <TooltipProvider>
                <Toaster />
                <ConfirmHost />
                <div className={APP_SHELL_CLASS}>
                    <aside
                        data-testid='app-sidebar'
                        className={cn(SIDER_CLASS, siderWidthClass(collapsed))}
                    >
                        <div className='flex items-center gap-2 px-4 py-4 text-base font-semibold tracking-wide'>
                            <span className='size-2 shrink-0 rounded-full bg-sidebar-primary' />
                            {sidebarBrand(collapsed)}
                        </div>
                        <nav className='flex flex-1 flex-col gap-1 px-2'>
                            {menuItems.map((item) => (
                                <MenuLink
                                    key={item.key}
                                    item={item}
                                    selected={item.key === selectedKey}
                                    collapsed={collapsed}
                                />
                            ))}
                        </nav>
                        <div className='p-2'>
                            <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                onClick={() => setCollapsed((current) => !current)}
                                aria-label={collapseAriaLabel(collapsed)}
                            >
                                <PanelLeft />
                                {collapseButtonLabel(collapsed)}
                            </Button>
                        </div>
                    </aside>
                    <div className={MAIN_LAYOUT_CLASS}>
                        <header data-testid='app-header' className={HEADER_CLASS}>
                            <span>{PAGE_TITLES[selectedKey]}</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className='inline-flex items-center gap-2'>
                                        <Sun className='size-4 text-muted-foreground' />
                                        <Switch
                                            aria-label='黑夜模式'
                                            checked={themeMode === 'dark'}
                                            onCheckedChange={(checked) =>
                                                onThemeChange(themeFromSwitch(checked))
                                            }
                                        />
                                        <Moon className='size-4 text-muted-foreground' />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>{themeSwitchTitle(themeMode)}</TooltipContent>
                            </Tooltip>
                        </header>
                        <main data-testid='app-content' className={CONTENT_CLASS}>
                            <AppRoutes />
                        </main>
                    </div>
                </div>
            </TooltipProvider>
        </ThemeModeContext.Provider>
    );
}

function MenuLink({
    item,
    selected,
    collapsed,
}: {
    item: (typeof menuItems)[number];
    selected: boolean;
    collapsed: boolean;
}) {
    const link = <NavItemLink item={item} selected={selected} collapsed={collapsed} />;
    if (!collapsed) {
        return link;
    }
    return (
        <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side='right'>{item.label}</TooltipContent>
        </Tooltip>
    );
}

function NavItemLink({
    item,
    selected,
    collapsed,
}: {
    item: (typeof menuItems)[number];
    selected: boolean;
    collapsed: boolean;
}) {
    const Icon = item.icon;
    return (
        <Link
            to={item.key}
            className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                selectedMenuClass(selected),
                collapsedMenuClass(collapsed),
            )}
        >
            <Icon className='size-4 shrink-0' />
            {menuItemLabel(collapsed, item.label)}
        </Link>
    );
}

export default function App() {
    const [themeMode, setThemeMode] = useState(() => getStoredTheme(window.localStorage));

    useEffect(() => {
        applyThemeClass(themeMode);
    }, [themeMode]);

    const changeTheme = (nextThemeMode: ThemeMode) => {
        setThemeMode(nextThemeMode);
        setStoredTheme(window.localStorage, nextThemeMode);
    };

    return <AppContent themeMode={themeMode} onThemeChange={changeTheme} />;
}
