import { describe, expect, test } from 'bun:test';
import {
    applyRuntimeAssetEnv,
    createRuntimeAssetConfigurator,
    resolveBundledRuntimeAssets,
} from '../src/lib/runtime-assets';

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

test('打包程序查找同目录资源并更新给定环境', () => {
    const env = { MIDSCENE_FFMPEG_PATH: '/old/ffmpeg', MIDSCENE_SCRCPY_SERVER_PATH: '/old/scrcpy' };
    const configure = createRuntimeAssetConfigurator({
        platform: 'linux',
        executablePath: '/app/test-web-use-ai',
        cwd: () => '/other',
        exists: (file) =>
            file === '/app/runtime-tools/ffmpeg' || file === '/app/runtime-tools/scrcpy-server',
        env,
    });

    const assets = configure();

    expect({ assets, env }).toEqual({
        assets: {
            ffmpegPath: '/app/runtime-tools/ffmpeg',
            scrcpyServerPath: '/app/runtime-tools/scrcpy-server',
        },
        env: {
            MIDSCENE_FFMPEG_PATH: '/app/runtime-tools/ffmpeg',
            MIDSCENE_SCRCPY_SERVER_PATH: '/app/runtime-tools/scrcpy-server',
        },
    });
});

test('缺失的捆绑资源不覆盖已有的外部资源配置', () => {
    const env = {
        MIDSCENE_FFMPEG_PATH: '/external/ffmpeg',
        MIDSCENE_SCRCPY_SERVER_PATH: '/external/scrcpy',
    };

    applyRuntimeAssetEnv({ ffmpegPath: null, scrcpyServerPath: null }, env);

    expect(env).toEqual({
        MIDSCENE_FFMPEG_PATH: '/external/ffmpeg',
        MIDSCENE_SCRCPY_SERVER_PATH: '/external/scrcpy',
    });
});

test('只有 FFmpeg 时不会清空已有 scrcpy 配置', () => {
    const env = {
        MIDSCENE_FFMPEG_PATH: '/old/ffmpeg',
        MIDSCENE_SCRCPY_SERVER_PATH: '/external/scrcpy',
    };

    applyRuntimeAssetEnv({ ffmpegPath: '/bundled/ffmpeg', scrcpyServerPath: null }, env);

    expect(env).toEqual({
        MIDSCENE_FFMPEG_PATH: '/bundled/ffmpeg',
        MIDSCENE_SCRCPY_SERVER_PATH: '/external/scrcpy',
    });
});

test('开发运行每次配置都读取当前工作目录', () => {
    let directory = '/first';
    const configure = createRuntimeAssetConfigurator({
        platform: 'darwin',
        executablePath: '/bin/bun',
        cwd: () => directory,
        exists: () => true,
        env: {},
    });
    const first = configure();

    directory = '/second';
    const second = configure();

    expect([first.ffmpegPath, second.ffmpegPath]).toEqual([
        '/first/runtime-tools/ffmpeg',
        '/second/runtime-tools/ffmpeg',
    ]);
});

test('资源查询异常不会写入部分环境配置', () => {
    const env: Record<string, string | undefined> = {};
    const configure = createRuntimeAssetConfigurator({
        platform: 'win32',
        executablePath: 'C:\\app\\test-web-use-ai.exe',
        cwd: () => 'C:\\other',
        exists: () => {
            throw new Error('无权读取资源');
        },
        env,
    });
    let message = '';

    try {
        configure();
    } catch (error) {
        message = (error as Error).message;
    }

    expect({ message, env }).toEqual({ message: '无权读取资源', env: {} });
});
