import { Glob } from 'bun';
import { formatCrapReport, scoreFromLcov, type SourceFile } from './crap/report';

const LCOV_PATH = 'coverage/lcov.info';
const SOURCE_GLOB = 'src/**/*.{ts,tsx}';
const IO_ORCHESTRATION_FILES = new Set([
    'src/server/runner.ts',
    'src/server/android-preview.ts',
    'src/server/android-service.ts',
    'src/server/chrome.ts',
    'src/server/port.ts',
    'src/server/static.ts',
    'src/server/ws.ts',
    'src/server/screencast.ts',
    'src/server/runtime-assets.ts',
]);

function shouldSkip(file: string) {
    if (file.endsWith('.d.ts') || file.includes('/gen/') || file.startsWith('src/web/src/pages/')) {
        return true;
    }
    if (IO_ORCHESTRATION_FILES.has(file)) {
        return true;
    }
    return file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

async function loadSources() {
    const sources: SourceFile[] = [];
    for await (const file of new Glob(SOURCE_GLOB).scan({ onlyFiles: true })) {
        if (shouldSkip(file)) {
            continue;
        }
        sources.push({ file, source: await Bun.file(file).text() });
    }
    sources.sort((left, right) => left.file.localeCompare(right.file));
    return sources;
}

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
    process.exit(report.failed.length === 0 ? 0 : 1);
}
