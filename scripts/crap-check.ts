import { Glob } from 'bun';
import { formatCrapReport, scoreFromLcov, type SourceFile } from './crap/report';

const LCOV_PATH = 'coverage/lcov.info';
const SOURCE_GLOBS = ['app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];
// 编排型代码：圈复杂度来自 I/O/路由/进程胶水，不是业务规则。纳入前要先拆函数或补测试。
const SKIP_FILES = new Set([
    'app/server/src/index.ts',
    'app/server/src/routes.ts',
    'app/server/src/runner.ts',
    'app/server/src/android-preview.ts',
    'app/server/src/android-service.ts',
    'app/server/src/chrome.ts',
    'app/server/src/port.ts',
    'app/server/src/static.ts',
    'app/server/src/ws.ts',
    'app/server/src/screencast.ts',
    'app/server/src/runtime-assets.ts',
    'app/web/src/App.tsx',
]);

function shouldSkip(file: string) {
    if (file.endsWith('.d.ts') || file.includes('/gen/')) {
        return true;
    }
    // 页面没有单测，不进覆盖率报告；整目录先豁免，避免按 cov=0 误杀。
    if (file.startsWith('app/web/src/pages/')) {
        return true;
    }
    if (SKIP_FILES.has(file)) {
        return true;
    }
    return file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

async function loadSources() {
    const sources: SourceFile[] = [];
    for (const glob of SOURCE_GLOBS) {
        for await (const file of new Glob(glob).scan({ onlyFiles: true })) {
            if (shouldSkip(file)) {
                continue;
            }
            sources.push({ file, source: await Bun.file(file).text() });
        }
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
    process.exit(report.passed ? 0 : 1);
}
