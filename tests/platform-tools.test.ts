import { describe, expect, test } from 'bun:test';
import { platformToolsPackage, PLATFORM_TOOLS_VERSION } from '../scripts/platform-tools';

describe('platformToolsPackage', () => {
    test('macOS 使用固定版本官方压缩包和 adb 文件', () => {
        expect(platformToolsPackage('darwin-arm64')).toEqual({
            url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-darwin.zip`,
            requiredFiles: ['adb'],
        });
    });

    test('Windows 包含 adb 及运行所需 DLL', () => {
        expect(platformToolsPackage('win32-x64')).toEqual({
            url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-win.zip`,
            requiredFiles: ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll'],
        });
    });

    test('Linux 使用对应平台的官方压缩包', () => {
        expect(platformToolsPackage('linux-x64')).toEqual({
            url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-linux.zip`,
            requiredFiles: ['adb'],
        });
    });
});

import { createPlatformToolsInstaller } from '../scripts/platform-tools';
import { createBuildFixture } from './helpers/build-fixture';

function platformFixture(platform: string) {
    const fixture = createBuildFixture();
    const info = platformToolsPackage(platform);
    fixture.responses.set(info.url, new Response('平台压缩包'));
    fixture.state.command = async () => {
        for (const name of info.requiredFiles)
            fixture.files.set(
                `out/.platform-tools-download/extracted/platform-tools/${name}`,
                `内容:${name}`,
            );
    };
    return fixture;
}

test('Unix 安装复制完整资源并设置 adb 执行权限', async () => {
    const fixture = platformFixture('darwin-arm64');

    await createPlatformToolsInstaller(fixture.io)('out', 'darwin-arm64');

    expect({
        adb: fixture.files.get('out/platform-tools/adb'),
        mode: fixture.permissions.get('out/platform-tools/adb'),
    }).toEqual({ adb: '内容:adb', mode: 0o755 });
});

test('Windows 安装保留两个 DLL 且不设置 Unix 权限', async () => {
    const fixture = platformFixture('win32-x64');

    await createPlatformToolsInstaller(fixture.io)('out', 'win32-x64');

    expect({
        files: [...fixture.files.keys()].sort(),
        permissions: fixture.permissions.size,
    }).toEqual({
        files: [
            'out/platform-tools/AdbWinApi.dll',
            'out/platform-tools/AdbWinUsbApi.dll',
            'out/platform-tools/adb.exe',
        ],
        permissions: 0,
    });
});

test('缺少 DLL 时拒绝把不完整资源当作成功安装', async () => {
    const fixture = platformFixture('win32-x64');
    fixture.state.command = async () => {
        fixture.files.set('out/.platform-tools-download/extracted/platform-tools/adb.exe', 'adb');
    };

    await expect(createPlatformToolsInstaller(fixture.io)('out', 'win32-x64')).rejects.toThrow(
        'Platform Tools 缺少必要文件：AdbWinApi.dll',
    );
});

test('下载失败保留 HTTP 上下文并清理临时目录', async () => {
    const fixture = platformFixture('linux-x64');
    fixture.responses.set(platformToolsPackage('linux-x64').url, new Response('', { status: 503 }));
    let message = '';

    try {
        await createPlatformToolsInstaller(fixture.io)('out', 'linux-x64');
    } catch (error) {
        message = (error as Error).message;
    }

    expect({ message, tempExists: fixture.io.exists('out/.platform-tools-download') }).toEqual({
        message: '下载 Android Platform Tools 失败：HTTP 503',
        tempExists: false,
    });
});

test('解压失败向上传播并清除已下载的压缩包', async () => {
    const fixture = platformFixture('linux-x64');
    fixture.state.command = async () => {
        throw new Error('无效的 ZIP');
    };
    let message = '';

    try {
        await createPlatformToolsInstaller(fixture.io)('out', 'linux-x64');
    } catch (error) {
        message = (error as Error).message;
    }

    expect({ message, files: [...fixture.files.keys()] }).toEqual({
        message: '无效的 ZIP',
        files: [],
    });
});
