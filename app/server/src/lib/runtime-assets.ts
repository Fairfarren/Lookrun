import { existsSync } from 'node:fs';
import path from 'node:path';

interface RuntimeAssetInput {
    platform: NodeJS.Platform;
    executablePath: string;
    cwd: string;
    exists: (filePath: string) => boolean;
}

export function resolveBundledRuntimeAssets(input: RuntimeAssetInput) {
    const pathApi = input.platform === 'win32' ? path.win32 : path.posix;
    const executableName = pathApi.basename(input.executablePath).toLowerCase();
    const executableDir = executableName.startsWith('bun')
        ? input.cwd
        : pathApi.dirname(input.executablePath);
    const runtimeDir = pathApi.join(executableDir, 'runtime-tools');
    const ffmpegPath = pathApi.join(
        runtimeDir,
        input.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
    );
    const scrcpyServerPath = pathApi.join(runtimeDir, 'scrcpy-server');
    return {
        ffmpegPath: input.exists(ffmpegPath) ? ffmpegPath : null,
        scrcpyServerPath: input.exists(scrcpyServerPath) ? scrcpyServerPath : null,
    };
}

export function applyRuntimeAssetEnv(
    assets: { ffmpegPath: string | null; scrcpyServerPath: string | null },
    env: Record<string, string | undefined>,
) {
    if (assets.ffmpegPath) {
        env.MIDSCENE_FFMPEG_PATH = assets.ffmpegPath;
    }
    if (assets.scrcpyServerPath) {
        env.MIDSCENE_SCRCPY_SERVER_PATH = assets.scrcpyServerPath;
    }
}

export function createRuntimeAssetConfigurator(
    input: Omit<RuntimeAssetInput, 'cwd'> & {
        cwd: () => string;
        env: Record<string, string | undefined>;
    },
) {
    return function configureBundledRuntimeAssets() {
        const assets = resolveBundledRuntimeAssets({ ...input, cwd: input.cwd() });
        applyRuntimeAssetEnv(assets, input.env);
        return assets;
    };
}

export const configureBundledRuntimeAssets = createRuntimeAssetConfigurator({
    platform: process.platform,
    executablePath: process.execPath,
    cwd: process.cwd,
    exists: existsSync,
    env: process.env,
});
