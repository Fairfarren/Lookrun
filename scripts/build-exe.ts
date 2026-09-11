// 编译单文件可执行程序并附上 sharp 的 native 资产
// 产物按平台分别输出到 dist-mac / dist-win / dist-linux
// 用法：bun scripts/build-exe.ts [--target=bun-windows-x64|bun-darwin-arm64|...]
//
// 背景：sharp 是 native addon（依赖 libvips），bun build --compile 无法把它的 .node
// 嵌入单文件。这里把 sharp 的 JS（含 patch）bundle 进 exe，native .node + libvips
// 动态库外置到 exe 同级的 node_modules/@img/，运行时由 patched sharp.js 从磁盘加载
import { $ } from 'bun';
import { mkdirSync, existsSync, cpSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { installPlatformTools } from './platform-tools';
import { installRuntimeAssets } from './runtime-assets';

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const target = targetArg?.split('=')[1];

// 平台 key：bun-darwin-arm64 → darwin-arm64，bun-windows-x64 → win32-x64
function platformKey(): string {
    const t = target ?? `bun-${process.platform}-${process.arch}`;
    return t.replace(/^bun-/, '').replace('windows', 'win32');
}

function pickOutDir(): string {
    const pk = platformKey();
    if (pk.startsWith('win32')) {
        return 'dist-win';
    }
    if (pk.startsWith('darwin')) {
        return 'dist-mac';
    }
    return 'dist-linux';
}

const outDir = pickOutDir();
const ext = outDir === 'dist-win' ? '.exe' : '';
const outFile = `${outDir}/test-web-use-ai${ext}`;
mkdirSync(outDir, { recursive: true });

const args = ['bun', 'build', 'src/server/index.ts', '--compile', '--outfile', outFile];
if (target) {
    args.push('--target', target);
}
console.log(`编译中：${args.join(' ')}`);
await $`${args}`;
console.log(`产物：${outFile}`);

// ---------- 拷贝 sharp native 资产 ----------
// sharp 的 native 包按平台分包：@img/sharp-{plat}（含 .node）和 @img/sharp-libvips-{plat}（libvips 动态库）
// 版本从已装 sharp 的 optionalDependencies 读取，保证和 bundle 进 exe 的 sharp JS 版本一致
async function copySharpNative() {
    const platKey = platformKey();
    const sharpPkgName = `@img/sharp-${platKey}`;
    const libvipsPkgName = `@img/sharp-libvips-${platKey}`;
    const sharpOpt = (() => {
        try {
            const pkg = JSON.parse(readFileSync('node_modules/sharp/package.json', 'utf8')) as {
                optionalDependencies?: Record<string, string>;
            };
            return pkg.optionalDependencies ?? {};
        } catch (error) {
            throw new Error(
                `读取 sharp/package.json 失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    })();
    const sharpVer = sharpOpt[sharpPkgName];
    const libvipsVer = sharpOpt[libvipsPkgName];
    if (!sharpVer) {
        throw new Error(
            `无法从 sharp optionalDependencies 解析平台 ${platKey} 的 sharp native 版本（${sharpPkgName}=${sharpVer}）`,
        );
    }

    const dstImgDir = path.join(outDir, 'node_modules', '@img');
    mkdirSync(dstImgDir, { recursive: true });

    // windows 的 libvips 已内嵌在 sharp-win32-x64 包里，optionalDependencies 不含独立的 libvips 包，
    // 此时 libvipsVer 为 undefined，跳过即可
    const nativePkgs: Array<[string, string]> = [[sharpPkgName, sharpVer]];
    if (libvipsVer) {
        nativePkgs.push([libvipsPkgName, libvipsVer]);
    }

    for (const [pkg, ver] of nativePkgs) {
        const pkgDirName = pkg.replace('@img/', '');
        const srcDir = path.join('node_modules', '@img', pkgDirName);
        const dstDir = path.join(dstImgDir, pkgDirName);
        rmSync(dstDir, { recursive: true, force: true });
        if (existsSync(path.join(srcDir, 'lib'))) {
            // 本机已装该平台包（如 mac 打 mac 包），直接拷
            cpSync(srcDir, dstDir, { recursive: true });
            console.log(`native 拷贝(本地)：${pkg}@${ver}`);
        } else {
            // 交叉编译目标平台包未装，从 npm registry 下载 tarball 解压
            await downloadAndExtract(pkg, ver, dstDir);
            console.log(`native 下载(registry)：${pkg}@${ver}`);
        }
    }
}

// 从 npm registry 下载 scoped 包 tarball 并解压到目标目录（strip package/ 前缀）
async function downloadAndExtract(pkg: string, ver: string, dstDir: string) {
    const fileName = `${pkg.replace(/^@[^/]+\//, '')}-${ver}.tgz`;
    const url = `https://registry.npmjs.org/${pkg}/-/${fileName}`;
    console.log(`下载 ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`下载 ${pkg}@${ver} 失败：HTTP ${res.status}`);
    }
    const tgzPath = path.join(dstDir + '-download.tgz');
    await Bun.write(tgzPath, Buffer.from(await res.arrayBuffer()));
    mkdirSync(dstDir, { recursive: true });
    // tar 解压并去掉顶层 package/ 目录前缀
    await $`tar xzf ${tgzPath} -C ${dstDir} --strip-components=1`;
    rmSync(tgzPath, { force: true });
    if (!existsSync(path.join(dstDir, 'lib'))) {
        throw new Error(`${pkg}@${ver} 解压后未找到 lib/ 目录`);
    }
}

await copySharpNative();
await installPlatformTools(outDir, platformKey());
await installRuntimeAssets(outDir, platformKey());
console.log(
    `完成：${outDir}/（exe + sharp native + Android Platform Tools + FFmpeg + scrcpy-server）`,
);
