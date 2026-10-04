import { strict as assert } from 'node:assert';
import path from 'node:path';
import {
    smokeIo,
    smokeRequest,
    withServer,
    withTempDirectory,
    type SmokeClient,
    type SmokeIo,
} from './smoke-common';

export function artifactPaths(platformKey: string) {
    const windows = platformKey.startsWith('win32-');
    return {
        executable: windows ? 'test-web-use-ai.exe' : 'test-web-use-ai',
        tools: [
            windows ? 'runtime-tools/ffmpeg.exe' : 'runtime-tools/ffmpeg',
            'runtime-tools/scrcpy-server',
            ...(windows
                ? [
                      'platform-tools/adb.exe',
                      'platform-tools/AdbWinApi.dll',
                      'platform-tools/AdbWinUsbApi.dll',
                  ]
                : ['platform-tools/adb']),
        ],
        nativePackage: `node_modules/@img/sharp-${platformKey}/package.json`,
    };
}

export async function requireArtifact(filePath: string, io: SmokeIo) {
    const file = io.file(filePath);
    assert.ok(await file.exists(), `产物缺少文件：${filePath}`);
    assert.ok(file.size > 0, `产物文件为空：${filePath}`);
}

export async function checkArtifactFiles(
    input: { directory: string; platformKey: string },
    io: SmokeIo,
) {
    const artifacts = artifactPaths(input.platformKey);
    for (const relative of [artifacts.executable, ...artifacts.tools, artifacts.nativePackage]) {
        await requireArtifact(path.join(input.directory, relative), io);
    }
    const nativePackage = await io.file(path.join(input.directory, artifacts.nativePackage)).json();
    assert.equal(nativePackage.name, `@img/sharp-${input.platformKey}`, 'sharp 目标平台不匹配');
    const nativeFile = `node_modules/@img/sharp-${input.platformKey}/lib/sharp-${input.platformKey}.node`;
    await requireArtifact(path.join(input.directory, nativeFile), io);
    return path.join(input.directory, artifacts.executable);
}

export function fetchableAssetUrls(references: string[], base: string) {
    const urls = references
        .map((reference) => new URL(reference, base))
        .filter((url) => url.protocol !== 'data:');
    for (const url of urls) assert.equal(url.origin, new URL(base).origin, '页面引用了外部资源');
    return [...new Set(urls.map((url) => url.pathname + url.search))];
}

export function localAssetUrls(html: string, base: string) {
    const matches = [
        ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=(["'])(.*?)\1[^>]*>/gis),
    ];
    const urls = fetchableAssetUrls(
        matches.map((match) => match[2]!),
        base,
    );
    assert.ok(
        urls.some((url) => url.endsWith('.js')),
        '首页没有引用构建后的 JavaScript',
    );
    assert.ok(
        urls.some((url) => url.endsWith('.css')),
        '首页没有引用构建后的 CSS',
    );
    return urls;
}

export async function checkStaticAsset(client: SmokeClient, pathname: string) {
    const asset = await smokeRequest(client, { pathname, method: 'GET', status: 200 });
    const bytes = await asset.arrayBuffer();
    assert.ok(bytes.byteLength > 0, `静态资源为空：${pathname}`);
    const contentType = asset.headers.get('content-type') ?? '';
    assert.doesNotMatch(contentType, /^text\/html/, `静态资源被错误回退到首页：${pathname}`);
    if (pathname.endsWith('.js'))
        assert.match(contentType, /(?:application|text)\/javascript/, '脚本 MIME 类型错误');
    if (!pathname.endsWith('.css')) return [];
    assert.match(contentType, /^text\/css/, '样式 MIME 类型错误');
    const references = [
        ...new TextDecoder().decode(bytes).matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g),
    ];
    return fetchableAssetUrls(
        references.map((match) => match[2]!),
        new URL(pathname, client.base).href,
    );
}

export async function checkPackagedHttp(client: SmokeClient) {
    const page = await smokeRequest(client, { pathname: '/', method: 'GET', status: 200 });
    assert.match(page.headers.get('content-type') ?? '', /^text\/html/, '首页 MIME 类型错误');
    const html = await page.text();
    assert.match(html, /<div[^>]+id=["']root["']/, '首页没有应用挂载点');
    const assets = new Set(localAssetUrls(html, client.base));
    for (const pathname of assets) {
        for (const referenced of await checkStaticAsset(client, pathname)) assets.add(referenced);
    }
    const fallback = await smokeRequest(client, { pathname: '/tasks', method: 'GET', status: 200 });
    assert.equal(await fallback.text(), html, '页面路由未回退到内嵌首页');
    await smokeRequest(client, { pathname: '/missing-smoke-asset.js', method: 'GET', status: 404 });
}

export async function runBuildSmoke(
    input: { directory: string; platformKey: string },
    io: SmokeIo,
) {
    assert.equal(
        input.platformKey,
        `${process.platform}-${process.arch}`,
        '必须在目标平台运行构建冒烟，不能跳过执行验证',
    );
    const directory = path.resolve(input.directory);
    const executable = await checkArtifactFiles({ directory, platformKey: input.platformKey }, io);
    return withTempDirectory(
        (dataDir) =>
            withServer(
                {
                    command: [executable],
                    cwd: dataDir,
                    dataDir,
                    failAt: -1,
                    check: checkPackagedHttp,
                },
                io,
            ),
        io,
    );
}

export function buildSmokeOptions(args: string[]) {
    assert.equal(args.length, 1, '用法：bun scripts/build-smoke.ts <产物目录>');
    return { directory: args[0]!, platformKey: `${process.platform}-${process.arch}` };
}

export async function runBuildSmokeCli(
    input: {
        main: boolean;
        args: string[];
        log: (message: string) => void;
    },
    io: SmokeIo,
) {
    if (!input.main) return;
    await runBuildSmoke(buildSmokeOptions(input.args), io);
    input.log('BUILD_SMOKE_PASS');
}

await runBuildSmokeCli(
    { main: import.meta.main, args: process.argv.slice(2), log: console.log },
    smokeIo,
);
