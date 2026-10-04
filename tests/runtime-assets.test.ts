import { expect, test } from 'bun:test';
import { createRuntimeAssetInstaller } from '../scripts/runtime-assets';
import { createBuildFixture } from './helpers/build-fixture';

function runtimeFixture(platform: string) {
    const fixture = createBuildFixture();
    const { installer, binaryName } = fixture.addInstaller(platform);
    const url = `https://registry.npmjs.org/@ffmpeg-installer/${platform}/-/${platform}-4.1.0.tgz`;
    fixture.responses.set(url, new Response('FFmpeg 压缩包'));
    fixture.state.command = async () => {
        fixture.files.set(`out/.runtime-assets-download/${binaryName}`, 'FFmpeg二进制');
    };
    return { ...fixture, installer, binaryName, url };
}

test('读取安装器锁定的平台版本和 Windows 二进制名', () => {
    const fixture = runtimeFixture('win32-x64');

    const info = createRuntimeAssetInstaller(fixture.io).ffmpegPackageForPlatform('win32-x64');

    expect(info).toEqual({
        packageName: '@ffmpeg-installer/win32-x64',
        version: '4.1.0',
        binaryName: 'ffmpeg.exe',
    });
});

test.each([{}, { optionalDependencies: {} }])('平台版本缺失时明确报错：%p', (manifest) => {
    const fixture = runtimeFixture('linux-x64');
    fixture.files.set(fixture.installer, JSON.stringify(manifest));

    expect(() =>
        createRuntimeAssetInstaller(fixture.io).ffmpegPackageForPlatform('linux-x64'),
    ).toThrow('不支持为 linux-x64 打包 FFmpeg');
});

test('本机平台从安装器解析树复制 FFmpeg 和 scrcpy-server', async () => {
    const fixture = runtimeFixture('darwin-arm64');
    fixture.addPackage({
        from: fixture.installer,
        name: '@ffmpeg-installer/darwin-arm64',
        directory: '/installed/ffmpeg-native',
        manifest: {},
    });
    fixture.files.set('/installed/ffmpeg-native/ffmpeg', '本机FFmpeg');

    await createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'darwin-arm64');

    expect([
        fixture.files.get('out/runtime-tools/ffmpeg'),
        fixture.files.get('out/runtime-tools/scrcpy-server'),
    ]).toEqual(['本机FFmpeg', 'scrcpy服务端']);
});

test('跨平台安装下载二进制并清理临时文件', async () => {
    const fixture = runtimeFixture('win32-x64');

    await createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'win32-x64');

    expect({
        ffmpeg: fixture.files.get('out/runtime-tools/ffmpeg.exe'),
        scrcpy: fixture.files.get('out/runtime-tools/scrcpy-server'),
        tempExists: fixture.io.exists('out/.runtime-assets-download'),
    }).toEqual({ ffmpeg: 'FFmpeg二进制', scrcpy: 'scrcpy服务端', tempExists: false });
});

test('下载的 FFmpeg 包缺少二进制时报错', async () => {
    const fixture = runtimeFixture('linux-x64');
    fixture.state.command = async () => {};

    await expect(
        createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'linux-x64'),
    ).rejects.toThrow('FFmpeg 压缩包中缺少 ffmpeg');
});

test('下载失败保留包名、版本和状态码', async () => {
    const fixture = runtimeFixture('linux-x64');
    fixture.responses.set(fixture.url, new Response('', { status: 404 }));

    await expect(
        createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'linux-x64'),
    ).rejects.toThrow('下载 @ffmpeg-installer/linux-x64@4.1.0 失败：HTTP 404');
});

test('scrcpy 复制失败仍清理下载目录', async () => {
    const fixture = runtimeFixture('linux-x64');
    fixture.files.delete('/installed/android/bin/scrcpy-server');
    let message = '';

    try {
        await createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'linux-x64');
    } catch (error) {
        message = (error as Error).message;
    }

    expect({ message, tempExists: fixture.io.exists('out/.runtime-assets-download') }).toEqual({
        message: '源文件不存在：/installed/android/bin/scrcpy-server',
        tempExists: false,
    });
});

test('解压失败仍清理下载目录', async () => {
    const fixture = runtimeFixture('linux-x64');
    fixture.state.command = async () => {
        throw new Error('tar 解压失败');
    };
    let message = '';

    try {
        await createRuntimeAssetInstaller(fixture.io).installRuntimeAssets('out', 'linux-x64');
    } catch (error) {
        message = (error as Error).message;
    }

    expect({ message, tempExists: fixture.io.exists('out/.runtime-assets-download') }).toEqual({
        message: 'tar 解压失败',
        tempExists: false,
    });
});
