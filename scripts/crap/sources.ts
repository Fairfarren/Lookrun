import { Glob } from 'bun';
import type { SourceFile } from './report';

export const SOURCE_GLOBS = [
    'app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'packages/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    '*.{ts,tsx,js,jsx,mjs,cjs}',
];

// 仅资源生成器的实际输出可豁免，不能把整个 gen 目录视为生成代码。
export const GENERATED_SOURCES = ['app/server/src/gen/assets.ts'];

export function shouldSkipSource(file: string) {
    const segments = file.split('/');
    if (segments.some((segment) => ['node_modules', 'dist', 'tests'].includes(segment))) {
        return true;
    }
    if (file.endsWith('.d.ts') || GENERATED_SOURCES.includes(file)) return true;
    return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export async function loadSources() {
    const sources: SourceFile[] = [];
    for (const glob of SOURCE_GLOBS) {
        for await (const file of new Glob(glob).scan({ onlyFiles: true })) {
            if (shouldSkipSource(file)) continue;
            sources.push({ file, source: await Bun.file(file).text() });
        }
    }
    sources.sort((left, right) => left.file.localeCompare(right.file));
    return sources;
}
