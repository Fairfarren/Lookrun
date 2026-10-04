import {
    createCoverageMap,
    type CoverageMapData,
    type FileCoverageData,
} from 'istanbul-lib-coverage';
import { createContext } from 'istanbul-lib-report';
import { create } from 'istanbul-reports';

function validateRecord(expected: FileCoverageData, actual: FileCoverageData) {
    for (const key of ['statementMap', 'fnMap', 'branchMap'] as const) {
        if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
            throw new Error(`覆盖率源码映射不匹配：${expected.path} (${key})`);
        }
    }
    for (const key of ['s', 'f'] as const) {
        if (Object.keys(expected[key]).join() !== Object.keys(actual[key]).join()) {
            throw new Error(`覆盖率计数项缺失：${expected.path} (${key})`);
        }
        if (Object.values(actual[key]).some((count) => !Number.isFinite(count) || count < 0)) {
            throw new Error(`覆盖率计数无效：${expected.path} (${key})`);
        }
    }
}

export function coverageReport(data: CoverageMapData, baseline: FileCoverageData[]) {
    if (baseline.length === 0 || Object.keys(data).length === 0) {
        throw new Error('覆盖率报告或源码清单为空');
    }
    const expected = new Map(baseline.map((file) => [file.path, file]));
    for (const [file, actual] of Object.entries(data)) {
        const initial = expected.get(file);
        if (!initial || actual.path !== file) throw new Error(`覆盖率路径不匹配：${file}`);
        validateRecord(initial, actual);
    }
    const map = createCoverageMap(
        Object.fromEntries(baseline.map((file) => [file.path, structuredClone(file)])),
    );
    map.merge(data);
    const summary = map.getCoverageSummary();
    const files = map.files().map((file) => ({
        file,
        ...map.fileCoverageFor(file).toSummary().data,
    }));
    const passed = files.every(
        ({ lines, functions }) =>
            lines.covered === lines.total && functions.covered === functions.total,
    );
    return { map, summary: summary.data, files, passed };
}

export function writeCoverageReports(
    report: ReturnType<typeof coverageReport>,
    contextFactory?: typeof createContext,
) {
    const context = (contextFactory ?? createContext)({ dir: 'coverage', coverageMap: report.map });
    create('lcovonly').execute(context);
    create('json-summary').execute(context);
    create('text-summary').execute(context);
}
