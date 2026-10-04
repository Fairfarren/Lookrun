import { mkdirSync, rmSync } from 'node:fs';
import { loadSources } from './crap/sources';
import { formatCrapReport, scoreFromLcov } from './crap/report';
import { instrumentSources } from './coverage/instrument';
import { coverageReport, writeCoverageReports } from './coverage/report';
import { createCoverageMap, type CoverageMapData } from 'istanbul-lib-coverage';
import { TEST_GROUPS } from './coverage/test-groups';

const qualityIO = {
    remove: rmSync,
    mkdir: mkdirSync,
    loadSources,
    write: Bun.write,
    file: Bun.file,
    spawn: Bun.spawn,
    writeReports: writeCoverageReports,
    log: console.log,
    process,
};

export async function runQuality(io: typeof qualityIO) {
    io.remove('coverage', { recursive: true, force: true });
    io.mkdir('coverage', { recursive: true });
    const sources = await io.loadSources();
    const entries = instrumentSources(sources);
    await io.write('coverage/instrumented.json', JSON.stringify(entries));
    await io.write(
        'coverage/sources.json',
        JSON.stringify(
            sources.map(({ file }) => file),
            null,
            2,
        ),
    );
    const map = createCoverageMap({});
    let testExit = 0;
    for (const group of TEST_GROUPS) {
        const output = `coverage/coverage-${group.name}.json`;
        const testProcess = io.spawn(
            ['bun', 'test', '--preload', './tests/helpers/coverage-preload.ts', ...group.args],
            {
                stdout: 'inherit',
                stderr: 'inherit',
                env: { ...process.env, LOOKRUN_COVERAGE_OUTPUT: output },
            },
        );
        testExit |= await testProcess.exited;
        const data = (await io.file(output).json()) as CoverageMapData;
        const checked = coverageReport(
            data,
            entries.map(({ coverage }) => coverage),
        );
        map.merge(checked.map);
    }
    const data = map.toJSON();
    await io.write('coverage/coverage-final.json', JSON.stringify(data));
    const report = coverageReport(
        data,
        entries.map(({ coverage }) => coverage),
    );
    io.writeReports(report);
    const crap = formatCrapReport(
        scoreFromLcov(sources, await io.file('coverage/lcov.info').text()),
    );
    io.log(crap.text);
    await io.write('coverage/crap.md', crap.text);
    io.log(
        `完整源码：${report.files.length} 个文件；行 ${report.summary.lines.covered}/${report.summary.lines.total}；函数 ${report.summary.functions.covered}/${report.summary.functions.total}`,
    );
    return testExit === 0 && report.passed && crap.passed;
}

export async function runQualityCommand(
    input: { main: boolean },
    dependencies?: Partial<typeof qualityIO>,
) {
    if (!input.main) return;
    const io = { ...qualityIO, ...dependencies };
    io.process.exitCode = (await runQuality(io)) ? 0 : 1;
}

await runQualityCommand({ main: import.meta.main });
