import path from 'node:path';
import { buildIO, type BuildIO } from './build-io';
import { SERVER_PACKAGE_JSON } from './workspace-module';

export function createRuntimeAssetInstaller(io: BuildIO) {
    function ffmpegPackageForPlatform(platformKey: string) {
        const packageName = `@ffmpeg-installer/${platformKey}`;
        const installer = io.resolve(SERVER_PACKAGE_JSON, '@ffmpeg-installer/ffmpeg/package.json');
        const packageJson = io.readJson(installer) as {
            optionalDependencies?: Record<string, string>;
        };
        const version = packageJson.optionalDependencies?.[packageName];
        if (!version) throw new Error(`不支持为 ${platformKey} 打包 FFmpeg`);
        return {
            packageName,
            version,
            binaryName: platformKey.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg',
        };
    }

    async function downloadFfmpeg(
        outDir: string,
        packageInfo: ReturnType<typeof ffmpegPackageForPlatform>,
    ) {
        const packageDirName = packageInfo.packageName.replace(/^@[^/]+\//, '');
        const tarballName = `${packageDirName}-${packageInfo.version}.tgz`;
        const tempDir = path.join(outDir, '.runtime-assets-download');
        const tarballPath = path.join(tempDir, tarballName);
        io.remove(tempDir);
        io.mkdir(tempDir);
        await io.download({
            url: `https://registry.npmjs.org/${packageInfo.packageName}/-/${tarballName}`,
            destination: tarballPath,
            label: `${packageInfo.packageName}@${packageInfo.version}`,
        });
        await io.run(['tar', 'xzf', tarballPath, '-C', tempDir, '--strip-components=1']);
        const binaryPath = path.join(tempDir, packageInfo.binaryName);
        if (!io.exists(binaryPath))
            throw new Error(`FFmpeg 压缩包中缺少 ${packageInfo.binaryName}`);
        return binaryPath;
    }

    function localFfmpegPath(packageInfo: ReturnType<typeof ffmpegPackageForPlatform>) {
        const installer = io.resolve(SERVER_PACKAGE_JSON, '@ffmpeg-installer/ffmpeg/package.json');
        const localPackage = io.find(installer, `${packageInfo.packageName}/package.json`);
        return localPackage
            ? path.join(path.dirname(localPackage), packageInfo.binaryName)
            : undefined;
    }

    async function installRuntimeAssets(outDir: string, platformKey: string) {
        const packageInfo = ffmpegPackageForPlatform(platformKey);
        const targetDir = path.join(outDir, 'runtime-tools');
        const localPath = localFfmpegPath(packageInfo);
        io.remove(targetDir);
        io.mkdir(targetDir);
        try {
            const ffmpegSource = localPath ?? (await downloadFfmpeg(outDir, packageInfo));
            io.copy(ffmpegSource, path.join(targetDir, packageInfo.binaryName));
            const androidPackage = io.resolve(
                SERVER_PACKAGE_JSON,
                '@midscene/android/package.json',
            );
            io.copy(
                path.join(path.dirname(androidPackage), 'bin', 'scrcpy-server'),
                path.join(targetDir, 'scrcpy-server'),
            );
            io.log(
                `运行时资源已安装：${packageInfo.packageName}@${packageInfo.version} + scrcpy-server`,
            );
        } finally {
            if (!localPath) io.remove(path.join(outDir, '.runtime-assets-download'));
        }
    }

    return { ffmpegPackageForPlatform, installRuntimeAssets };
}

export const { ffmpegPackageForPlatform, installRuntimeAssets } =
    createRuntimeAssetInstaller(buildIO);
