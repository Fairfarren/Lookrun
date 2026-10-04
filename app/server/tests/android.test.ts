import { describe, expect, test } from 'bun:test';
import {
    createAndroidAppLauncher,
    createAndroidDeviceChecker,
    createAndroidDeviceLister,
    findLauncherAppCenter,
    isDirectAndroidLaunchTarget,
    parseAndroidLauncherPackages,
    parseAndroidScreenSize,
    resolveAdbPath,
} from '../src/services/android';

const launcherXml = (name: string, bounds: string) =>
    `<hierarchy><node text="${name}" content-desc="${name}" clickable="true" enabled="true" bounds="${bounds}" /></hierarchy>`;

describe('isDirectAndroidLaunchTarget', () => {
    test('包名继续使用 Android 原生启动', () => {
        expect(isDirectAndroidLaunchTarget('org.telegram.messenger.web')).toBe(true);
    });

    test('普通应用名称改走桌面名称查找', () => {
        expect(isDirectAndroidLaunchTarget('Telegram')).toBe(false);
    });
});

describe('findLauncherAppCenter', () => {
    test('忽略应用名称大小写并返回图标中心', () => {
        expect(
            findLauncherAppCenter(launcherXml('Telegram', '[439,264][640,583]'), 'telegram'),
        ).toEqual({ x: 539, y: 423 });
    });

    test('匹配包含 XML 转义字符的应用名称', () => {
        expect(findLauncherAppCenter(launcherXml('A&amp;B', '[10,20][30,40]'), 'A&B')).toEqual({
            x: 20,
            y: 30,
        });
    });
});

describe('parseAndroidLauncherPackages', () => {
    test('从可启动组件中提取包名并排序', () => {
        const output = [
            'com.example.second/.MainActivity',
            'com.example.first/com.example.first.LauncherActivity',
        ].join('\n');

        expect(parseAndroidLauncherPackages(output)).toEqual([
            { packageName: 'com.example.first' },
            { packageName: 'com.example.second' },
        ]);
    });

    test('同一应用存在多个启动入口时只保留一个包名', () => {
        const output = [
            'com.example.same/.MainActivity',
            'com.example.same/.AlternateActivity',
        ].join('\n');

        expect(parseAndroidLauncherPackages(output)).toEqual([{ packageName: 'com.example.same' }]);
    });

    test('忽略命令说明和格式异常的行', () => {
        const output = [
            '2 activities found:',
            'No activities found',
            'com.example.valid/.MainActivity',
            'invalid-package/MainActivity',
        ].join('\n');

        expect(parseAndroidLauncherPackages(output)).toEqual([
            { packageName: 'com.example.valid' },
        ]);
    });
});

test('Android 屏幕尺寸优先使用当前覆盖值', () => {
    expect(parseAndroidScreenSize('Physical size: 1080x2220\nOverride size: 720x1480')).toEqual({
        width: 720,
        height: 1480,
    });
});

describe('createAndroidAppLauncher', () => {
    test('包名不操作桌面并直接交给原启动器', async () => {
        const calls: string[] = [];
        const launchApp = createAndroidAppLauncher({
            directLaunch: async (target) => calls.push(`direct:${target}`),
            prepareAppList: async () => calls.push('prepare'),
            readUi: async () => launcherXml('Telegram', '[0,0][20,20]'),
            scrollAppList: async () => calls.push('scroll'),
            tap: async ({ x, y }) => calls.push(`tap:${x},${y}`),
            waitAfterTap: async () => calls.push('wait'),
        });

        await launchApp('org.telegram.messenger.web');

        expect(calls).toEqual(['direct:org.telegram.messenger.web']);
    });

    test('应用名称在桌面列表中找到后点击图标', async () => {
        const calls: string[] = [];
        const launchApp = createAndroidAppLauncher({
            directLaunch: async (target) => calls.push(`direct:${target}`),
            prepareAppList: async () => calls.push('prepare'),
            readUi: async () => launcherXml('Telegram', '[40,60][80,100]'),
            scrollAppList: async () => calls.push('scroll'),
            tap: async ({ x, y }) => calls.push(`tap:${x},${y}`),
            waitAfterTap: async () => calls.push('wait'),
        });

        await launchApp('telegram');

        expect(calls).toEqual(['prepare', 'tap:60,80', 'wait']);
    });

    test('当前页面找不到名称时继续滚动查找', async () => {
        const pages = [
            launcherXml('ctest', '[0,0][20,20]'),
            launcherXml('Telegram', '[100,200][300,400]'),
        ];
        let pageIndex = 0;
        const calls: string[] = [];
        const launchApp = createAndroidAppLauncher({
            directLaunch: async () => {},
            prepareAppList: async () => {},
            readUi: async () => pages[pageIndex],
            scrollAppList: async () => {
                calls.push('scroll');
                pageIndex += 1;
            },
            tap: async ({ x, y }) => calls.push(`tap:${x},${y}`),
            waitAfterTap: async () => {},
        });

        await launchApp('Telegram');

        expect(calls).toEqual(['scroll', 'tap:200,300']);
    });

    test('应用列表中不存在目标名称时返回可读错误', async () => {
        const launchApp = createAndroidAppLauncher({
            directLaunch: async () => {},
            prepareAppList: async () => {},
            readUi: async () => launcherXml('ctest', '[0,0][20,20]'),
            scrollAppList: async () => {},
            tap: async () => {},
            waitAfterTap: async () => {},
        });

        await expect(launchApp('不存在')).rejects.toThrow('没有找到名为「不存在」的 App');
    });
});

describe('createAndroidDeviceLister', () => {
    test('返回可用于任务表单的设备号和型号', async () => {
        const listDevices = createAndroidDeviceLister(async () => [
            { udid: 'test-device', model: 'Pixel' },
        ]);

        expect(await listDevices()).toEqual([{ id: 'test-device', name: 'Pixel' }]);
    });

    test('过滤没有设备号的异常条目', async () => {
        const listDevices = createAndroidDeviceLister(async () => [
            { udid: '' },
            { udid: 'valid-device' },
        ]);

        expect(await listDevices()).toEqual([{ id: 'valid-device', name: 'valid-device' }]);
    });
});

describe('createAndroidDeviceChecker', () => {
    test('目标设备在线时返回设备信息', async () => {
        const checkDevice = createAndroidDeviceChecker(async () => [
            { id: 'test-device', name: 'Pixel' },
        ]);

        expect(await checkDevice('test-device')).toEqual({
            ok: true,
            device: { id: 'test-device', name: 'Pixel' },
        });
    });

    test('目标设备离线时返回可读错误', async () => {
        const checkDevice = createAndroidDeviceChecker(async () => []);

        expect(await checkDevice('offline-device')).toEqual({
            ok: false,
            message: '设备 offline-device 未连接或未授权',
        });
    });
});

describe('resolveAdbPath', () => {
    test('优先使用随程序分发的 macOS ADB', () => {
        const result = resolveAdbPath({
            platform: 'darwin',
            executableDir: '/app',
            environmentPath: '/custom/adb',
            sdkRoot: undefined,
            pathAdb: '/system/adb',
            exists: (filePath) => filePath === '/app/platform-tools/adb',
        });

        expect(result).toBe('/app/platform-tools/adb');
    });

    test('Windows 使用 adb.exe 并在内置资源缺失时回退显式路径', () => {
        const result = resolveAdbPath({
            platform: 'win32',
            executableDir: 'C:\\app',
            environmentPath: 'D:\\sdk\\adb.exe',
            sdkRoot: undefined,
            pathAdb: undefined,
            exists: (filePath) => filePath === 'D:\\sdk\\adb.exe',
        });

        expect(result).toBe('D:\\sdk\\adb.exe');
    });
});

test('开发模式从工作目录检测ADB且回退SDK根目录', async () => {
    const { detectAdbPath } = await import('../src/services/android');

    const result = detectAdbPath({
        platform: 'darwin',
        execPath: '/bin/bun',
        cwd: () => '/workspace',
        env: { ANDROID_SDK_ROOT: '/sdk' },
        which: () => null,
        exists: (file) => file === '/sdk/platform-tools/adb',
    });

    expect(result).toBe('/sdk/platform-tools/adb');
});

test('打包模式优先使用可执行文件旁的ADB', async () => {
    const { detectAdbPath } = await import('../src/services/android');

    const result = detectAdbPath({
        platform: 'darwin',
        execPath: '/app/lookrun',
        cwd: () => '/workspace',
        env: { ANDROID_HOME: '/sdk', MIDSCENE_ADB_PATH: '/custom/adb' },
        which: () => '/usr/bin/adb',
        exists: (file) => file === '/app/platform-tools/adb',
    });

    expect(result).toBe('/app/platform-tools/adb');
});
