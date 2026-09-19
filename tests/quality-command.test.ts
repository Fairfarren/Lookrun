import { expect, test } from 'bun:test';
import { runQualityCommand } from '../scripts/test-quality';
import { qualityFixture } from './helpers/coverage-fixture';

test('完整覆盖且测试通过时退出零并生成同源LCOV与CRAP报告', async () => {
    const fixture = qualityFixture({});

    await runQualityCommand({ main: true }, fixture.io);

    expect({
        exit: fixture.exit.exitCode,
        lcov: fixture.files.get('coverage/lcov.info'),
        crap: fixture.files.get('coverage/crap.md'),
    }).toEqual({
        exit: 0,
        lcov: expect.stringContaining('FNH:1'),
        crap: expect.stringContaining('**结论**: 通过'),
    });
});

test('遗漏函数测试使质量命令退出非零', async () => {
    const fixture = qualityFixture({ uncovered: true });

    await runQualityCommand({ main: true }, fixture.io);

    expect({ exit: fixture.exit.exitCode, lcov: fixture.files.get('coverage/lcov.info') }).toEqual({
        exit: 1,
        lcov: expect.stringContaining('FNH:0'),
    });
});

test('测试失败不能被全覆盖报告掩盖', async () => {
    const fixture = qualityFixture({ testFailure: true });

    await runQualityCommand({ main: true }, fixture.io);

    expect(fixture.exit.exitCode).toBe(1);
});

test('空报告直接失败且不输出成功状态', async () => {
    const fixture = qualityFixture({ corrupt: true });

    await expect(runQualityCommand({ main: true }, fixture.io)).rejects.toThrow('为空');
});

test('前后端隔离执行，每个测试目录只进入一个测试进程', async () => {
    const fixture = qualityFixture({});

    await runQualityCommand({ main: true }, fixture.io);

    expect(fixture.processes).toEqual([
        [
            'bun',
            'test',
            '--preload',
            './tests/helpers/coverage-preload.ts',
            './tests',
            './app/server/tests',
            './packages/shared/tests',
        ],
        [
            'bun',
            'test',
            '--preload',
            './tests/helpers/coverage-preload.ts',
            '--preload',
            './app/web/tests/helpers/dom.ts',
            './app/web/tests',
        ],
    ]);
});

test('导入质量命令不运行子进程或修改退出状态', async () => {
    const fixture = qualityFixture({});

    await runQualityCommand({ main: false }, fixture.io);

    expect({
        processes: fixture.processes,
        files: fixture.files.size,
        exit: fixture.exit.exitCode,
    }).toEqual({ processes: [], files: 0, exit: 0 });
});
