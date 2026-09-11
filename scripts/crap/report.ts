import { calculateCrap, CRAP_THRESHOLD } from './formula';
import { collectFunctions, type FunctionMetric } from './complexity';
import { coverageInRange, parseLcov, type FileHits, type LineHits } from './lcov';

export type CrapResult = {
    name: string;
    file: string;
    cc: number;
    cov: number;
    crap: number;
    passed: boolean;
};

export type SourceFile = {
    file: string;
    source: string;
};

export function scoreFunction(fn: FunctionMetric, hits: LineHits | undefined) {
    const cov = hits ? coverageInRange(hits, { startLine: fn.startLine, endLine: fn.endLine }) : 0;
    const crap = calculateCrap(fn.cc, cov);
    return {
        name: fn.name,
        file: fn.file,
        cc: fn.cc,
        cov,
        crap,
        passed: crap <= CRAP_THRESHOLD,
    };
}

export function scoreSources(sources: SourceFile[], coverage: FileHits) {
    const results: CrapResult[] = [];
    for (const item of sources) {
        const hits = coverage.get(item.file);
        for (const fn of collectFunctions(item.source, item.file)) {
            results.push(scoreFunction(fn, hits));
        }
    }
    return results;
}

export function scoreFromLcov(sources: SourceFile[], lcovText: string) {
    return scoreSources(sources, parseLcov(lcovText));
}

export function formatCrapReport(results: CrapResult[]) {
    const failed = results.filter((item) => !item.passed);
    const empty = results.length === 0;
    const passed = !empty && failed.length === 0;
    const lines = [
        '## CRAP 检查',
        '',
        `**门槛**: CRAP ≤ ${CRAP_THRESHOLD}`,
        `**检查函数**: ${results.length}`,
        `**不通过**: ${failed.length}`,
    ];
    if (failed.length > 0) {
        lines.push(
            '',
            '| 函数 | 文件 | CC | 覆盖率 | CRAP | 结论 |',
            '|------|------|----|--------|------|------|',
        );
        for (const item of failed) {
            const covPct = `${(item.cov * 100).toFixed(0)}%`;
            lines.push(
                `| \`${item.name}\` | ${item.file} | ${item.cc} | ${covPct} | ${item.crap.toFixed(2)} | 不通过 |`,
            );
        }
    }
    if (empty) {
        lines.push('', '没有检查到任何函数：覆盖率报告为空或路径对不上。');
    }
    lines.push('', `**结论**: ${passed ? '通过' : '不通过'}`);
    return { text: `${lines.join('\n')}\n`, failed, passed };
}
