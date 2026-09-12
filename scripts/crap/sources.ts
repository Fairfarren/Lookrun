import { Glob } from 'bun';
import type { SourceFile } from './report';

export const SOURCE_GLOBS = ['app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

export function shouldSkipSource(file: string) {
    if (file.endsWith('.d.ts') || file.includes('/gen/')) {
        return true;
    }
    return file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

export async function loadSources() {
    const sources: SourceFile[] = [];
    for (const glob of SOURCE_GLOBS) {
        for await (const file of new Glob(glob).scan({ onlyFiles: true })) {
            if (shouldSkipSource(file)) {
                continue;
            }
            sources.push({ file, source: await Bun.file(file).text() });
        }
    }
    sources.sort((left, right) => left.file.localeCompare(right.file));
    return sources;
}
