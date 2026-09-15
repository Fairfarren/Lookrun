import { describe, expect, test } from 'bun:test';
import { loadSources, shouldSkipSource } from '@scripts/crap/sources';

describe('shouldSkipSource', () => {
    test('跳过测试文件', () => {
        expect(shouldSkipSource('app/server/tests/db.test.ts')).toBe(true);
        expect(shouldSkipSource('app/web/tests/theme.test.tsx')).toBe(true);
    });

    test('跳过类型声明和生成文件', () => {
        expect(shouldSkipSource('app/server/src/assets.d.ts')).toBe(true);
        expect(shouldSkipSource('app/server/src/gen/assets.ts')).toBe(true);
    });

    test('不跳过页面和编排源码', () => {
        expect(shouldSkipSource('app/web/src/pages/task-edit/index.tsx')).toBe(false);
        expect(shouldSkipSource('app/web/src/App.tsx')).toBe(false);
        expect(shouldSkipSource('app/server/src/services/runner.ts')).toBe(false);
        expect(shouldSkipSource('app/server/src/index.ts')).toBe(false);
        expect(shouldSkipSource('app/server/src/routes/index.ts')).toBe(false);
    });
});

describe('loadSources', () => {
    test('全量源码包含原先被豁免的文件', async () => {
        const files = (await loadSources()).map((item) => item.file);

        expect(files).toContain('app/web/src/pages/task-edit/index.tsx');
        expect(files).toContain('app/server/src/services/runner.ts');
        expect(files).toContain('app/web/src/App.tsx');
        expect(files.some((file) => file.endsWith('.test.ts'))).toBe(false);
    });
});
