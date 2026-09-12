import { formatCrapReport, scoreFromLcov } from './crap/report';
import { loadSources } from './crap/sources';

const LCOV_PATH = 'coverage/lcov.info';

async function loadLcov() {
    const file = Bun.file(LCOV_PATH);
    if (!(await file.exists())) {
        throw new Error(
            `找不到覆盖率报告 ${LCOV_PATH}，请先运行 bun test --coverage --coverage-reporter=lcov`,
        );
    }
    return file.text();
}

export async function runCrapCheck() {
    const sources = await loadSources();
    const lcovText = await loadLcov();
    const results = scoreFromLcov(sources, lcovText);
    return formatCrapReport(results);
}

if (import.meta.main) {
    const report = await runCrapCheck();
    process.stdout.write(report.text);
    process.exit(report.passed ? 0 : 1);
}
