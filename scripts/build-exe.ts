// sharp 的 native addon 无法嵌入单文件，必须随可执行文件携带平台对应的 .node 和 libvips。
import path from 'node:path';
import { buildIO, type BuildIO } from './build-io';
import { createPlatformToolsInstaller } from './platform-tools';
import { createRuntimeAssetInstaller } from './runtime-assets';
import { SERVER_PACKAGE_JSON } from './workspace-module';

type BuildInput = { argv: string[]; platform: string; arch: string };

function outputDirectory(platformKey: string) {
    if (platformKey.startsWith('win32')) return 'dist-win';
    if (platformKey.startsWith('darwin')) return 'dist-mac';
    return 'dist-linux';
}

export function executableBuildPlan(input: BuildInput) {
    const target = input.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length);
    const platformKey = (target ?? `bun-${input.platform}-${input.arch}`)
        .replace(/^bun-/, '')
        .replace('windows', 'win32');
    const outDir = outputDirectory(platformKey);
    const outFile = `${outDir}/test-web-use-ai${outDir === 'dist-win' ? '.exe' : ''}`;
    const args = ['bun', 'build', 'app/server/src/index.ts', '--compile', '--outfile', outFile];
    if (target) args.push('--target', target);
    return { outDir, outFile, platformKey, args };
}

function sharpDependencies(io: BuildIO) {
    try {
        const packagePath = io.resolve(SERVER_PACKAGE_JSON, 'sharp/package.json');
        const pkg = io.readJson(packagePath) as { optionalDependencies?: Record<string, string> };
        return { packagePath, dependencies: pkg.optionalDependencies ?? {} };
    } catch (error) {
        throw new Error(
            `读取 sharp/package.json 失败：${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

type NativePackage = { name: string; version: string; directory: string; sharpPackage: string };

async function downloadNativePackage(pkg: NativePackage, io: BuildIO) {
    const fileName = `${pkg.name.replace(/^@[^/]+\//, '')}-${pkg.version}.tgz`;
    const url = `https://registry.npmjs.org/${pkg.name}/-/${fileName}`;
    const tarball = `${pkg.directory}-download.tgz`;
    io.log(`下载 ${url}`);
    try {
        await io.download({ url, destination: tarball, label: `${pkg.name}@${pkg.version}` });
        io.mkdir(pkg.directory);
        await io.run(['tar', 'xzf', tarball, '-C', pkg.directory, '--strip-components=1']);
        if (!io.exists(path.join(pkg.directory, 'lib')))
            throw new Error(`${pkg.name}@${pkg.version} 解压后未找到 lib/ 目录`);
    } finally {
        io.remove(tarball);
    }
}

async function copyNativePackage(pkg: NativePackage, io: BuildIO) {
    const packagePath = io.find(pkg.sharpPackage, `${pkg.name}/package.json`);
    const source = packagePath ? path.dirname(packagePath) : undefined;
    io.remove(pkg.directory);
    if (source && io.exists(path.join(source, 'lib'))) {
        io.copy(source, pkg.directory);
        io.log(`native 拷贝(本地)：${pkg.name}@${pkg.version}`);
    } else {
        await downloadNativePackage(pkg, io);
        io.log(`native 下载(registry)：${pkg.name}@${pkg.version}`);
    }
}

async function copySharpNative(plan: ReturnType<typeof executableBuildPlan>, io: BuildIO) {
    const { dependencies, packagePath } = sharpDependencies(io);
    const sharpName = `@img/sharp-${plan.platformKey}`;
    const sharpVersion = dependencies[sharpName];
    if (!sharpVersion)
        throw new Error(
            `无法从 sharp optionalDependencies 解析平台 ${plan.platformKey} 的 sharp native 版本（${sharpName}=${sharpVersion}）`,
        );
    const packages: Array<[string, string]> = [[sharpName, sharpVersion]];
    const libvipsName = `@img/sharp-libvips-${plan.platformKey}`;
    const libvipsVersion = dependencies[libvipsName];
    // Windows 的 libvips 包含在 sharp native 包内，没有独立依赖。
    if (libvipsVersion) packages.push([libvipsName, libvipsVersion]);
    const imageDirectory = path.join(plan.outDir, 'node_modules', '@img');
    io.mkdir(imageDirectory);
    for (const [name, version] of packages) {
        await copyNativePackage(
            {
                name,
                version,
                directory: path.join(imageDirectory, name.replace('@img/', '')),
                sharpPackage: packagePath,
            },
            io,
        );
    }
}

export async function buildExecutable(input: BuildInput, io: BuildIO) {
    const plan = executableBuildPlan(input);
    io.mkdir(plan.outDir);
    io.log(`编译中：${plan.args.join(' ')}`);
    await io.run(plan.args);
    io.log(`产物：${plan.outFile}`);
    await copySharpNative(plan, io);
    await createPlatformToolsInstaller(io)(plan.outDir, plan.platformKey);
    await createRuntimeAssetInstaller(io).installRuntimeAssets(plan.outDir, plan.platformKey);
    io.log(
        `完成：${plan.outDir}/（exe + sharp native + Android Platform Tools + FFmpeg + scrcpy-server）`,
    );
    return plan;
}

export async function runBuildCommand(input: BuildInput & { main: boolean }, io: BuildIO) {
    if (!input.main) return;
    return buildExecutable(input, io);
}

await runBuildCommand(
    { main: import.meta.main, argv: process.argv, platform: process.platform, arch: process.arch },
    buildIO,
);
