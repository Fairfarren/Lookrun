import { expect, test } from 'bun:test';
import {
    artifactPaths,
    buildSmokeOptions,
    checkPackagedHttp,
    localAssetUrls,
    requireArtifact,
    runBuildSmoke,
} from '../scripts/build-smoke';
import { addArtifacts, smokeFixture } from './helpers/smoke-fixture';

test('Windows 产物必须附带 ADB 动态库', () => {
    const artifacts = artifactPaths('win32-x64');

    expect(artifacts.tools).toEqual([
        'runtime-tools/ffmpeg.exe',
        'runtime-tools/scrcpy-server',
        'platform-tools/adb.exe',
        'platform-tools/AdbWinApi.dll',
        'platform-tools/AdbWinUsbApi.dll',
    ]);
});

test('构建冒烟从独立目录启动并清理临时数据', async () => {
    const fixture = smokeFixture();
    addArtifacts(fixture, '/artifact');

    await runBuildSmoke(
        { directory: '/artifact', platformKey: `${process.platform}-${process.arch}` },
        fixture.io,
    );

    expect({
        cwd: fixture.state.serverCwd,
        directoryExists: fixture.state.directoryExists,
        childAlive: fixture.state.childAlive,
    }).toEqual({ cwd: '/temporary/isolated', directoryExists: false, childAlive: false });
});

test('缺少随包文件时失败', async () => {
    const { io } = smokeFixture();

    await expect(requireArtifact('/artifact/missing', io)).rejects.toThrow('产物缺少文件');
});

test('空的随包文件不能通过验证', async () => {
    const { io, state } = smokeFixture();
    state.files.set('/artifact/empty', '');

    await expect(requireArtifact('/artifact/empty', io)).rejects.toThrow('产物文件为空');
});

test('异平台构建产物不能静默跳过运行验证', async () => {
    const { io } = smokeFixture();

    await expect(
        runBuildSmoke({ directory: '/artifact', platformKey: 'invalid-platform' }, io),
    ).rejects.toThrow('必须在目标平台运行');
});

test('首页重复引用的本地资源只返回一次', () => {
    const html = '<script src="/a.js"></script><script src="/a.js"></script><link href="/a.css">';

    expect(localAssetUrls(html, 'http://local/')).toEqual(['/a.js', '/a.css']);
});

test('首页缺构建脚本时失败', () => {
    expect(() => localAssetUrls('<div id="root"></div>', 'http://local/')).toThrow('JavaScript');
});

test('首页引用外部资源时失败', () => {
    const html = '<script src="https://external/a.js"></script><link href="/a.css">';

    expect(() => localAssetUrls(html, 'http://local/')).toThrow('外部资源');
});

test('资源返回首页时失败', async () => {
    const { client, state } = smokeFixture();
    state.assetType = 'text/html';

    await expect(checkPackagedHttp(client)).rejects.toThrow('静态资源被错误回退到首页');
});

test('页面路由回退内容错误时失败', async () => {
    const { client, state } = smokeFixture();
    state.fallback = '错误页面';

    await expect(checkPackagedHttp(client)).rejects.toThrow('页面路由未回退');
});

test('构建冒烟命令解析产物目录', () => {
    expect(buildSmokeOptions(['dist-mac'])).toEqual({
        directory: 'dist-mac',
        platformKey: `${process.platform}-${process.arch}`,
    });
});

test('构建冒烟缺少目录参数时失败', () => {
    expect(() => buildSmokeOptions([])).toThrow('用法');
});

test('构建冒烟命令在验证产物后报告成功', async () => {
    const { runBuildSmokeCli } = await import('../scripts/build-smoke');
    const fixture = smokeFixture();
    addArtifacts(fixture, '/artifact');
    let output = '';

    await runBuildSmokeCli(
        {
            main: true,
            args: ['/artifact'],
            log: (message) => {
                output = message;
            },
        },
        fixture.io,
    );

    expect(output).toBe('BUILD_SMOKE_PASS');
});

test('内联图标无需请求但本地脚本和样式仍须检查', () => {
    const html = `<link href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>"><script src="/a.js"></script><link href="/a.css">`;

    expect(localAssetUrls(html, 'http://local/')).toEqual(['/a.js', '/a.css']);
});

test('构建冒烟检查样式引用的字体资源', async () => {
    const { client, io } = smokeFixture();
    const fetchOriginal = io.fetch;
    io.fetch = (async (url: URL, options: RequestInit) => {
        if (url.pathname === '/assets/app.css')
            return new Response('body { src: url("./font.woff2") }', {
                headers: { 'content-type': 'text/css' },
            });
        if (url.pathname === '/assets/font.woff2') return new Response('缺失', { status: 404 });
        return fetchOriginal(url, options);
    }) as typeof io.fetch;

    await expect(checkPackagedHttp(client)).rejects.toThrow('/assets/font.woff2 状态错误');
});
