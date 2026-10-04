import path from 'node:path';
import { buildIO, type BuildIO } from './build-io';

export const PLATFORM_TOOLS_VERSION = '37.0.0';

export function platformToolsPackage(platformKey: string) {
    if (platformKey.startsWith('win32')) {
        return {
            url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-win.zip`,
            requiredFiles: ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll'],
        };
    }
    if (platformKey.startsWith('darwin')) {
        return {
            url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-darwin.zip`,
            requiredFiles: ['adb'],
        };
    }
    return {
        url: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-linux.zip`,
        requiredFiles: ['adb'],
    };
}

export function createPlatformToolsInstaller(io: BuildIO) {
    return async function installPlatformTools(outDir: string, platformKey: string) {
        const packageInfo = platformToolsPackage(platformKey);
        const tempDir = path.join(outDir, '.platform-tools-download');
        const zipPath = path.join(tempDir, 'platform-tools.zip');
        const extractedDir = path.join(tempDir, 'extracted');
        const targetDir = path.join(outDir, 'platform-tools');
        io.remove(tempDir);
        io.mkdir(extractedDir);
        try {
            io.log(`下载 Android Platform Tools：${packageInfo.url}`);
            await io.download({
                url: packageInfo.url,
                destination: zipPath,
                label: 'Android Platform Tools',
            });
            await io.run(['unzip', '-q', zipPath, '-d', extractedDir]);
            io.remove(targetDir);
            io.copy(path.join(extractedDir, 'platform-tools'), targetDir);
            for (const fileName of packageInfo.requiredFiles) {
                if (!io.exists(path.join(targetDir, fileName)))
                    throw new Error(`Platform Tools 缺少必要文件：${fileName}`);
            }
            if (!platformKey.startsWith('win32')) io.makeExecutable(path.join(targetDir, 'adb'));
        } finally {
            io.remove(tempDir);
        }
    };
}

export const installPlatformTools = createPlatformToolsInstaller(buildIO);
