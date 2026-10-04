import path from 'node:path';
import { createBuildIO } from '../../scripts/build-io';
import { createPackageResolver, SERVER_PACKAGE_JSON } from '../../scripts/workspace-module';

export function createBuildFixture() {
    const files = new Map<string, string | Uint8Array>();
    const directories = new Set<string>();
    const permissions = new Map<string, number>();
    const packages = new Map<string, string>();
    const responses = new Map<string, Response | Error>();
    const logs: string[] = [];
    const state: { command: (args: string[]) => Promise<void> } = {
        command: async (args: string[]) => {
            throw new Error(`未提供命令桩：${args.join(' ')}`);
        },
    };
    const exists = (file: string) =>
        files.has(file) ||
        directories.has(file) ||
        [...files.keys()].some((name) => name.startsWith(`${file}/`));
    const resolver = createPackageResolver((fromFile) => ({
        resolve(moduleId) {
            const resolved = packages.get(`${fromFile}:${moduleId}`);
            if (!resolved)
                throw Object.assign(new Error(`找不到 ${moduleId}`), { code: 'MODULE_NOT_FOUND' });
            return resolved;
        },
    }));
    const io = createBuildIO({
        exists,
        mkdir(directory) {
            directories.add(directory);
        },
        remove(file) {
            for (const name of files.keys())
                if (name === file || name.startsWith(`${file}/`)) files.delete(name);
            for (const name of directories)
                if (name === file || name.startsWith(`${file}/`)) directories.delete(name);
        },
        copy(source, target) {
            if (!exists(source)) throw new Error(`源文件不存在：${source}`);
            const copied = [...files].filter(
                ([name]) => name === source || name.startsWith(`${source}/`),
            );
            for (const [name, content] of copied)
                files.set(`${target}${name.slice(source.length)}`, content);
            if (directories.has(source)) directories.add(target);
        },
        chmod(file, mode) {
            if (!exists(file)) throw new Error(`文件不存在：${file}`);
            permissions.set(file, mode);
        },
        readText(file) {
            const content = files.get(file);
            if (content === undefined) throw new Error(`文件不存在：${file}`);
            return typeof content === 'string' ? content : new TextDecoder().decode(content);
        },
        async write(file, data) {
            files.set(file, data);
        },
        async fetch(url) {
            const response = responses.get(url);
            if (!response) throw new Error(`未提供下载桩：${url}`);
            if (response instanceof Error) throw response;
            return response;
        },
        async shell(_strings, args) {
            await state.command(args);
        },
        Glob: class {
            async *scan(options: { cwd: string; onlyFiles: true }) {
                for (const file of files.keys())
                    if (file.startsWith(`${options.cwd}/`))
                        yield file.slice(options.cwd.length + 1);
            }
        },
        resolve: resolver.resolve,
        find: resolver.find,
        log: (message) => logs.push(message),
    });
    function addPackage(input: {
        from: string;
        name: string;
        directory: string;
        manifest: unknown;
    }) {
        const packageFile = path.join(input.directory, 'package.json');
        packages.set(`${input.from}:${input.name}/package.json`, packageFile);
        files.set(packageFile, JSON.stringify(input.manifest));
        return packageFile;
    }
    function addInstaller(platform: string) {
        const binaryName = platform.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg';
        const installer = addPackage({
            from: SERVER_PACKAGE_JSON,
            name: '@ffmpeg-installer/ffmpeg',
            directory: '/installed/ffmpeg',
            manifest: { optionalDependencies: { [`@ffmpeg-installer/${platform}`]: '4.1.0' } },
        });
        addPackage({
            from: SERVER_PACKAGE_JSON,
            name: '@midscene/android',
            directory: '/installed/android',
            manifest: {},
        });
        files.set('/installed/android/bin/scrcpy-server', 'scrcpy服务端');
        return { installer, binaryName };
    }
    return {
        io,
        files,
        directories,
        permissions,
        packages,
        responses,
        logs,
        state,
        addPackage,
        addInstaller,
    };
}
