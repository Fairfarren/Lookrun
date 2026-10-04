import { plugin } from 'bun';
import { afterAll } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import type { FileCoverageData } from 'istanbul-lib-coverage';

type Entry = {
    absolutePath: string;
    code: string;
    loader: 'ts' | 'tsx';
    coverage: FileCoverageData;
};

const entries = JSON.parse(readFileSync('coverage/instrumented.json', 'utf8')) as Entry[];
const modules = new Map(entries.map((entry) => [entry.absolutePath, entry]));
const context = globalThis as typeof globalThis & {
    __coverage__: Record<string, FileCoverageData>;
};
context.__coverage__ = Object.fromEntries(
    entries.map((entry) => [entry.absolutePath, entry.coverage]),
);

plugin({
    name: '全量源码覆盖率',
    setup(build) {
        const filter = new RegExp(
            `^(?:${[...modules.keys()].map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
        );
        build.onLoad({ filter }, ({ path }) => {
            const entry = modules.get(path);
            if (entry) return { contents: entry.code, loader: entry.loader };
        });
    },
});

// Bun 测试通过全局 afterAll 保存最终计数，不依赖进程退出事件。
afterAll(() => {
    writeFileSync(process.env.LOOKRUN_COVERAGE_OUTPUT!, JSON.stringify(context.__coverage__));
});
