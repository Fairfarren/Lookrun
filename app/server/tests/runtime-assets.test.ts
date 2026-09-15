import { describe, expect, test } from 'bun:test';
import { ffmpegPackageForPlatform } from '@scripts/runtime-assets';
import { resolveBundledRuntimeAssets } from '@server/lib/runtime-assets';

describe('ffmpegPackageForPlatform', () => {
    test('Windows x64 使用对应的 FFmpeg 可执行文件', () => {
        expect(ffmpegPackageForPlatform('win32-x64')).toEqual({
            packageName: '@ffmpeg-installer/win32-x64',
            version: '4.1.0',
            binaryName: 'ffmpeg.exe',
        });
    });

    test('macOS arm64 使用无扩展名的 FFmpeg', () => {
        expect(ffmpegPackageForPlatform('darwin-arm64')).toEqual({
            packageName: '@ffmpeg-installer/darwin-arm64',
            version: '4.1.5',
            binaryName: 'ffmpeg',
        });
    });
});

describe('resolveBundledRuntimeAssets', () => {
    test('Windows 打包程序从 EXE 同目录解析两个资源', () => {
        const runtimeDir = 'C:\\app\\runtime-tools';
        const result = resolveBundledRuntimeAssets({
            platform: 'win32',
            executablePath: 'C:\\app\\test-web-use-ai.exe',
            cwd: 'C:\\other',
            exists: (filePath) => filePath.startsWith(runtimeDir),
        });

        expect(result).toEqual({
            ffmpegPath: `${runtimeDir}\\ffmpeg.exe`,
            scrcpyServerPath: `${runtimeDir}\\scrcpy-server`,
        });
    });

    test('开发态从当前项目目录解析资源', () => {
        const runtimeDir = '/workspace/runtime-tools';
        const result = resolveBundledRuntimeAssets({
            platform: 'darwin',
            executablePath: '/opt/mise/bin/bun',
            cwd: '/workspace',
            exists: (filePath) => filePath.startsWith(runtimeDir),
        });

        expect(result).toEqual({
            ffmpegPath: `${runtimeDir}/ffmpeg`,
            scrcpyServerPath: `${runtimeDir}/scrcpy-server`,
        });
    });

    test('资源不存在时不注入无效路径', () => {
        expect(
            resolveBundledRuntimeAssets({
                platform: 'win32',
                executablePath: 'C:\\app\\test-web-use-ai.exe',
                cwd: 'C:\\other',
                exists: () => false,
            }),
        ).toEqual({ ffmpegPath: null, scrcpyServerPath: null });
    });
});
