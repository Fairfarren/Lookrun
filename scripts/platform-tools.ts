import { $ } from 'bun';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

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

export async function installPlatformTools(outDir: string, platformKey: string) {
    const packageInfo = platformToolsPackage(platformKey);
    const tempDir = path.join(outDir, '.platform-tools-download');
    const zipPath = path.join(tempDir, 'platform-tools.zip');
    const extractedDir = path.join(tempDir, 'extracted');
    const targetDir = path.join(outDir, 'platform-tools');

    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(extractedDir, { recursive: true });
    try {
        console.log(`下载 Android Platform Tools：${packageInfo.url}`);
        const response = await fetch(packageInfo.url);
        if (!response.ok) {
            throw new Error(`下载 Android Platform Tools 失败：HTTP ${response.status}`);
        }
        await Bun.write(zipPath, Buffer.from(await response.arrayBuffer()));
        await $`unzip -q ${zipPath} -d ${extractedDir}`;

        const sourceDir = path.join(extractedDir, 'platform-tools');
        rmSync(targetDir, { recursive: true, force: true });
        cpSync(sourceDir, targetDir, { recursive: true });

        for (const fileName of packageInfo.requiredFiles) {
            const filePath = path.join(targetDir, fileName);
            if (!existsSync(filePath)) {
                throw new Error(`Platform Tools 缺少必要文件：${fileName}`);
            }
        }
        if (!platformKey.startsWith('win32')) {
            chmodSync(path.join(targetDir, 'adb'), 0o755);
        }
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}
