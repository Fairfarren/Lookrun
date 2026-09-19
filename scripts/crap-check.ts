import { formatCrapReport, scoreFromLcov } from './crap/report';
import { loadSources } from './crap/sources';

const LCOV_PATH = 'coverage/lcov.info';
const crapIO = { loadSources, file: Bun.file, stdout: process.stdout, process };

async function loadLcov(fileProvider: typeof Bun.file) {
    const file = fileProvider(LCOV_PATH);
    if (!(await file.exists())) {
        throw new Error(`找不到覆盖率报告 ${LCOV_PATH}，请先运行 bun run test:quality`);
    }
    return file.text();
}

export async function runCrapCheck(dependencies?: Partial<typeof crapIO>) {
    const io = { ...crapIO, ...dependencies };
    const sources = await io.loadSources();
    const lcovText = await loadLcov(io.file);
    return formatCrapReport(scoreFromLcov(sources, lcovText));
}

export async function runCrapCommand(
    input: { main: boolean },
    dependencies?: Partial<typeof crapIO>,
) {
    if (!input.main) return;
    const io = { ...crapIO, ...dependencies };
    const report = await runCrapCheck(io);
    io.stdout.write(report.text);
    io.process.exitCode = report.passed ? 0 : 1;
}

await runCrapCommand({ main: import.meta.main });
