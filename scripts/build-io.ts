import { $, Glob } from 'bun';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { findFromPackage, resolveFromPackage } from './workspace-module';

type BuildRuntime = {
    exists: (file: string) => boolean;
    mkdir: (directory: string, options: { recursive: true }) => unknown;
    remove: (file: string, options: { recursive: true; force: true }) => unknown;
    copy: (source: string, target: string, options: { recursive: true }) => unknown;
    chmod: (file: string, mode: number) => unknown;
    readText: (file: string, encoding: 'utf8') => string;
    write: (file: string, data: string | Uint8Array) => Promise<unknown>;
    fetch: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'arrayBuffer'>>;
    shell: (strings: TemplateStringsArray, args: string[]) => PromiseLike<unknown>;
    Glob: new (pattern: string) => {
        scan: (options: { cwd: string; onlyFiles: true }) => AsyncIterable<string>;
    };
    resolve: typeof resolveFromPackage;
    find: typeof findFromPackage;
    log: (message: string) => void;
};

export function createBuildIO(runtime: BuildRuntime) {
    return {
        exists: runtime.exists,
        resolve: runtime.resolve,
        find: runtime.find,
        log: runtime.log,
        write: runtime.write,
        mkdir(directory: string) {
            runtime.mkdir(directory, { recursive: true });
        },
        remove(file: string) {
            runtime.remove(file, { recursive: true, force: true });
        },
        copy(source: string, target: string) {
            runtime.copy(source, target, { recursive: true });
        },
        makeExecutable(file: string) {
            runtime.chmod(file, 0o755);
        },
        readJson(file: string): unknown {
            return JSON.parse(runtime.readText(file, 'utf8'));
        },
        async run(args: string[]) {
            await runtime.shell`${args}`;
        },
        async files(directory: string) {
            const files: string[] = [];
            for await (const file of new runtime.Glob('**/*').scan({
                cwd: directory,
                onlyFiles: true,
            }))
                files.push(file);
            return files;
        },
        async download(input: { url: string; destination: string; label: string }) {
            const response = await runtime.fetch(input.url);
            if (!response.ok) throw new Error(`下载 ${input.label} 失败：HTTP ${response.status}`);
            await runtime.write(input.destination, new Uint8Array(await response.arrayBuffer()));
        },
    };
}

export type BuildIO = ReturnType<typeof createBuildIO>;

export const buildIO = createBuildIO({
    exists: existsSync,
    mkdir: mkdirSync,
    remove: rmSync,
    copy: cpSync,
    chmod: chmodSync,
    readText: readFileSync,
    write: Bun.write,
    fetch,
    shell: $,
    Glob,
    resolve: resolveFromPackage,
    find: findFromPackage,
    log: console.log,
});
