import { expect, test } from 'bun:test';
import { buildExecutable, executableBuildPlan, runBuildCommand } from '../scripts/build-exe';
import { platformToolsPackage } from '../scripts/platform-tools';
import { SERVER_PACKAGE_JSON } from '../scripts/workspace-module';
import { createBuildFixture } from './helpers/build-fixture';

function buildFixture(platform: string) {
    const fixture = createBuildFixture();
    const nativeName = `@img/sharp-${platform}`;
    const sharpPackage = fixture.addPackage({
        from: SERVER_PACKAGE_JSON,
        name: 'sharp',
        directory: '/installed/sharp',
        manifest: { optionalDependencies: { [nativeName]: '0.34.5' } },
    });
    fixture.addPackage({
        from: sharpPackage,
        name: nativeName,
        directory: '/installed/sharp-native',
        manifest: {},
    });
    fixture.files.set('/installed/sharp-native/lib/sharp.node', 'native二进制');
    const { installer, binaryName } = fixture.addInstaller(platform);
    fixture.addPackage({
        from: installer,
        name: `@ffmpeg-installer/${platform}`,
        directory: '/installed/ffmpeg-native',
        manifest: {},
    });
    fixture.files.set(`/installed/ffmpeg-native/${binaryName}`, 'FFmpeg二进制');
    const info = platformToolsPackage(platform);
    fixture.responses.set(info.url, new Response('平台压缩包'));
    fixture.state.command = async (args) => {
        if (args[0] === 'bun') fixture.files.set(args[args.indexOf('--outfile') + 1], '可执行程序');
        else if (args[0] === 'unzip') {
            const directory = args[args.indexOf('-d') + 1];
            for (const file of info.requiredFiles)
                fixture.files.set(`${directory}/platform-tools/${file}`, `平台文件:${file}`);
        } else throw new Error(`未提供命令桩：${args.join(' ')}`);
    };
    return { ...fixture, sharpPackage, nativeName };
}

function inputFor(platform: string) {
    const [hostPlatform, arch] = platform.split('-');
    return { argv: ['bun', 'scripts/build-exe.ts'], platform: hostPlatform, arch };
}

test('没有目标参数时使用宿主平台并输出 Linux 目录', () => {
    const input = inputFor('linux-x64');

    const plan = executableBuildPlan(input);

    expect(plan).toEqual({
        outDir: 'dist-linux',
        outFile: 'dist-linux/test-web-use-ai',
        platformKey: 'linux-x64',
        args: [
            'bun',
            'build',
            'app/server/src/index.ts',
            '--compile',
            '--outfile',
            'dist-linux/test-web-use-ai',
        ],
    });
});

test('Windows 交叉编译参数和扩展名保持 CLI 契约', () => {
    const input = {
        ...inputFor('darwin-arm64'),
        argv: ['bun', 'scripts/build-exe.ts', '--target=bun-windows-x64'],
    };

    const plan = executableBuildPlan(input);

    expect(plan).toEqual({
        outDir: 'dist-win',
        outFile: 'dist-win/test-web-use-ai.exe',
        platformKey: 'win32-x64',
        args: [
            'bun',
            'build',
            'app/server/src/index.ts',
            '--compile',
            '--outfile',
            'dist-win/test-web-use-ai.exe',
            '--target',
            'bun-windows-x64',
        ],
    });
});

test('CLI 构建产物同时包含 native、libvips 和运行时资源', async () => {
    const fixture = buildFixture('darwin-arm64');
    const libvipsName = '@img/sharp-libvips-darwin-arm64';
    fixture.files.set(
        fixture.sharpPackage,
        JSON.stringify({
            optionalDependencies: { [fixture.nativeName]: '0.34.5', [libvipsName]: '1.2.4' },
        }),
    );
    fixture.addPackage({
        from: fixture.sharpPackage,
        name: libvipsName,
        directory: '/installed/libvips',
        manifest: {},
    });
    fixture.files.set('/installed/libvips/lib/libvips.dylib', 'libvips二进制');

    const plan = await runBuildCommand({ ...inputFor('darwin-arm64'), main: true }, fixture.io);

    expect({
        outFile: plan?.outFile,
        files: [...fixture.files].filter(([file]) => file.startsWith('dist-mac/')).sort(),
    }).toEqual({
        outFile: 'dist-mac/test-web-use-ai',
        files: [
            ['dist-mac/node_modules/@img/sharp-darwin-arm64/lib/sharp.node', 'native二进制'],
            ['dist-mac/node_modules/@img/sharp-darwin-arm64/package.json', '{}'],
            [
                'dist-mac/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
                'libvips二进制',
            ],
            ['dist-mac/node_modules/@img/sharp-libvips-darwin-arm64/package.json', '{}'],
            ['dist-mac/platform-tools/adb', '平台文件:adb'],
            ['dist-mac/runtime-tools/ffmpeg', 'FFmpeg二进制'],
            ['dist-mac/runtime-tools/scrcpy-server', 'scrcpy服务端'],
            ['dist-mac/test-web-use-ai', '可执行程序'],
        ],
    });
});

test('未安装目标 native 包时从相同版本下载并清理压缩包', async () => {
    const fixture = buildFixture('win32-x64');
    fixture.packages.delete(`${fixture.sharpPackage}:${fixture.nativeName}/package.json`);
    fixture.responses.set(
        'https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.34.5.tgz',
        new Response('native压缩包'),
    );
    const otherCommands = fixture.state.command;
    fixture.state.command = async (args) => {
        if (args[0] === 'tar')
            fixture.files.set(
                'dist-win/node_modules/@img/sharp-win32-x64/lib/sharp.node',
                '下载的native',
            );
        else await otherCommands(args);
    };

    await buildExecutable(inputFor('win32-x64'), fixture.io);

    expect({
        native: fixture.files.get('dist-win/node_modules/@img/sharp-win32-x64/lib/sharp.node'),
        tarballExists: fixture.io.exists('dist-win/node_modules/@img/sharp-win32-x64-download.tgz'),
    }).toEqual({ native: '下载的native', tarballExists: false });
});

test('本地包缺少 lib 时下载替代包，下载内容缺失则失败', async () => {
    const fixture = buildFixture('linux-x64');
    fixture.files.delete('/installed/sharp-native/lib/sharp.node');
    fixture.responses.set(
        'https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.34.5.tgz',
        new Response('损坏的包'),
    );
    const otherCommands = fixture.state.command;
    fixture.state.command = async (args) => {
        if (args[0] !== 'tar') await otherCommands(args);
    };

    await expect(buildExecutable(inputFor('linux-x64'), fixture.io)).rejects.toThrow(
        '@img/sharp-linux-x64@0.34.5 解压后未找到 lib/ 目录',
    );
});

test('native 下载失败传播状态码且清理暂存包', async () => {
    const fixture = buildFixture('linux-x64');
    fixture.packages.delete(`${fixture.sharpPackage}:${fixture.nativeName}/package.json`);
    fixture.responses.set(
        'https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.34.5.tgz',
        new Response('', { status: 502 }),
    );
    let message = '';

    try {
        await buildExecutable(inputFor('linux-x64'), fixture.io);
    } catch (error) {
        message = (error as Error).message;
    }

    expect({
        message,
        tarballExists: fixture.io.exists(
            'dist-linux/node_modules/@img/sharp-linux-x64-download.tgz',
        ),
    }).toEqual({
        message: '下载 @img/sharp-linux-x64@0.34.5 失败：HTTP 502',
        tarballExists: false,
    });
});

test.each([{}, { optionalDependencies: {} }])(
    'sharp 缺少目标平台版本时拒绝继续构建：%p',
    async (manifest) => {
        const fixture = buildFixture('linux-x64');
        fixture.files.set(fixture.sharpPackage, JSON.stringify(manifest));

        await expect(buildExecutable(inputFor('linux-x64'), fixture.io)).rejects.toThrow(
            '无法从 sharp optionalDependencies 解析平台 linux-x64 的 sharp native 版本',
        );
    },
);

test('sharp 清单损坏时错误带读取上下文', async () => {
    const fixture = buildFixture('linux-x64');
    fixture.files.set(fixture.sharpPackage, '损坏的JSON');

    await expect(buildExecutable(inputFor('linux-x64'), fixture.io)).rejects.toThrow(
        '读取 sharp/package.json 失败：',
    );
});

test('sharp 解析器抛出非 Error 时仍保留错误上下文', async () => {
    const fixture = buildFixture('linux-x64');

    await expect(
        buildExecutable(inputFor('linux-x64'), {
            ...fixture.io,
            resolve: () => {
                throw '权限错误';
            },
        }),
    ).rejects.toThrow('读取 sharp/package.json 失败：权限错误');
});

test('编译失败停止安装并原样向命令调用者传播', async () => {
    const fixture = buildFixture('linux-x64');
    fixture.state.command = async () => {
        throw new Error('编译失败');
    };
    let message = '';

    try {
        await runBuildCommand({ ...inputFor('linux-x64'), main: true }, fixture.io);
    } catch (error) {
        message = (error as Error).message;
    }

    expect({
        message,
        artifacts: [...fixture.files.keys()].filter((file) => file.startsWith('dist-linux/')),
    }).toEqual({ message: '编译失败', artifacts: [] });
});

test('作为模块导入不产生构建产物', async () => {
    const fixture = createBuildFixture();

    await runBuildCommand({ ...inputFor('darwin-arm64'), main: false }, fixture.io);

    expect(fixture.files.size).toBe(0);
});
