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
