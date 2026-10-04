import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TEST_GROUPS } from '../scripts/coverage/test-groups';

test('真实Bun目录发现使前后端测试各执行一次并隔离预加载', async () => {
    // 这是测试发现机制的集成回归，必须使用真实 Bun 子进程与独立临时目录。
    const directory = await mkdtemp(path.join(tmpdir(), 'lookrun-discovery-'));
    try {
        for (const folder of ['tests', 'app/server/tests', 'packages/shared/tests']) {
            await Bun.write(
                path.join(directory, folder, 'discovery.test.ts'),
                `import { test, expect } from 'bun:test'; test('${folder}', () => { expect(globalThis.frontendLoaded).toBeUndefined(); console.log('DISCOVERED:${folder}'); });`,
            );
        }
        await Bun.write(
            path.join(directory, 'app/web/tests/helpers/dom.ts'),
            'globalThis.frontendLoaded = true;',
        );
        await Bun.write(
            path.join(directory, 'app/web/tests/discovery.test.ts'),
            "import { test, expect } from 'bun:test'; test('前端', () => { expect(globalThis.frontendLoaded).toBe(true); console.log('DISCOVERED:app/web/tests'); });",
        );
        const results = [];
        for (const group of TEST_GROUPS) {
            const child = Bun.spawn([process.execPath, 'test', ...group.args], {
                cwd: directory,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const [stdout, stderr, exit] = await Promise.all([
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
                child.exited,
            ]);
            results.push({
                exit,
                discovered: stdout
                    .split('\n')
                    .filter((line) => line.startsWith('DISCOVERED:'))
                    .sort(),
                errors: stderr.includes('(fail)'),
            });
        }

        expect(results).toEqual([
            {
                exit: 0,
                discovered: [
                    'DISCOVERED:app/server/tests',
                    'DISCOVERED:packages/shared/tests',
                    'DISCOVERED:tests',
                ],
                errors: false,
            },
            { exit: 0, discovered: ['DISCOVERED:app/web/tests'], errors: false },
        ]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
