import { runInNewContext } from 'node:vm';
import { expect, test } from 'bun:test';
import { instrumentSources } from '../scripts/coverage/instrument';
import { coverageReport } from '../scripts/coverage/report';
import type { CoverageMapData } from 'istanbul-lib-coverage';

function execute(source: string, calls: string) {
    const entries = instrumentSources([{ file: 'fixture.tsx', source }]);
    const context: { __coverage__?: CoverageMapData } = {};
    const code = new Bun.Transpiler({ loader: 'tsx', target: 'bun' }).transformSync(
        entries[0].code,
    );
    runInNewContext(`${code}\n${calls}`, context);
    return { entries, data: JSON.parse(JSON.stringify(context.__coverage__)) as CoverageMapData };
}

const fixture = `function choose(value: boolean): number {
    if (value) return 1;
    return 2;
}
function unused(): number { return 3; }`;

test('未导入源码以零命中计入分母', () => {
    const { entries, data } = execute(fixture, 'choose(true); choose(false); unused();');
    const [missing] = instrumentSources([
        { file: 'not-loaded.ts', source: 'function missing() { return 4; }' },
    ]);

    const report = coverageReport(data, [
        ...entries.map((entry) => entry.coverage),
        missing.coverage,
    ]);

    expect({ passed: report.passed, functions: report.summary.functions }).toEqual({
        passed: false,
        functions: { total: 3, covered: 2, skipped: 0, pct: 66.66 },
    });
});

test('所有函数调用但漏掉可执行行仍不通过', () => {
    const { entries, data } = execute(fixture, 'choose(true); unused();');

    const report = coverageReport(
        data,
        entries.map((entry) => entry.coverage),
    );

    expect([report.passed, report.summary.functions.pct, report.summary.lines.pct]).toEqual([
        false,
        100,
        66.66,
    ]);
});

test('删除关键测试会使函数和行覆盖率真实下降', () => {
    const full = execute(fixture, 'choose(true); choose(false); unused();');
    const reduced = execute(fixture, 'choose(true);');

    const reports = [full, reduced].map(({ entries, data }) => {
        const report = coverageReport(
            data,
            entries.map((entry) => entry.coverage),
        );
        return {
            passed: report.passed,
            functions: report.summary.functions.pct,
            lines: report.summary.lines.pct,
        };
    });

    expect(reports).toEqual([
        { passed: true, functions: 100, lines: 100 },
        { passed: false, functions: 50, lines: 33.33 },
    ]);
});

test('TS 与 TSX 计数映射保留原始函数和语句行号', () => {
    const [entry] = instrumentSources([
        {
            file: 'view.tsx',
            source: `type Props = { ready: boolean };

function View(props: Props) {
    return <span>{props.ready ? '完成' : '等待'}</span>;
}`,
        },
    ]);

    expect({
        functionLine: entry.coverage.fnMap[0].line,
        statementLine: entry.coverage.statementMap[0].start.line,
    }).toEqual({ functionLine: 3, statementLine: 4 });
});

test('空报告失败', () => {
    const [entry] = instrumentSources([{ file: 'a.ts', source: 'const a = 1;' }]);

    expect(() => coverageReport({}, [entry.coverage])).toThrow('为空');
});

test('空源码清单失败', () => {
    const [entry] = instrumentSources([{ file: 'a.ts', source: 'const a = 1;' }]);

    expect(() => coverageReport({ [entry.absolutePath]: entry.coverage }, [])).toThrow('为空');
});

test('报告路径不匹配失败', () => {
    const [entry] = instrumentSources([{ file: 'a.ts', source: 'const a = 1;' }]);

    expect(() => coverageReport({ 'wrong.ts': entry.coverage }, [entry.coverage])).toThrow(
        '路径不匹配',
    );
});

test('遗漏函数计数不能伪装成全覆盖', () => {
    const { entries, data } = execute(fixture, 'choose(true); choose(false); unused();');
    delete data[entries[0].absolutePath].f[1];

    expect(() =>
        coverageReport(
            data,
            entries.map((entry) => entry.coverage),
        ),
    ).toThrow('计数项缺失');
});

test('过期源码映射失败', () => {
    const { entries, data } = execute(fixture, 'choose(true); choose(false); unused();');
    data[entries[0].absolutePath].statementMap[0].start.line = 99;

    expect(() =>
        coverageReport(
            data,
            entries.map((entry) => entry.coverage),
        ),
    ).toThrow('源码映射不匹配');
});

test('无效计数失败', () => {
    const { entries, data } = execute(fixture, 'choose(true);');
    data[entries[0].absolutePath].s[0] = -1;

    expect(() =>
        coverageReport(
            data,
            entries.map((entry) => entry.coverage),
        ),
    ).toThrow('计数无效');
});

test('覆盖率豁免注释被拒绝', () => {
    expect(() =>
        instrumentSources([
            { file: 'hidden.ts', source: '// istanbul ignore next\nfunction hidden() {}' },
        ]),
    ).toThrow('豁免');
});

test.each(['const a = 1;', 'const ='])('插桩成功或失败都保留宿主堆栈设置：%s', (source) => {
    const original = { prepare: Error.prepareStackTrace, limit: Error.stackTraceLimit };

    try {
        instrumentSources([{ file: 'fixture.ts', source }]);
    } catch {}

    expect({ prepare: Error.prepareStackTrace, limit: Error.stackTraceLimit }).toEqual(original);
});

test('报告合并保留零覆盖基线供其他测试进程复用', () => {
    const { entries, data } = execute(fixture, 'choose(true); choose(false); unused();');
    const baseline = entries.map((entry) => entry.coverage);
    const original = structuredClone(baseline);

    coverageReport(data, baseline);

    expect(baseline).toEqual(original);
});

test('重复生成报告不会重复累计原始命中次数', () => {
    const { entries, data } = execute(fixture, 'choose(true); choose(false); unused();');
    const baseline = entries.map((entry) => entry.coverage);
    const first = structuredClone(coverageReport(data, baseline).map.toJSON());

    const second = coverageReport(data, baseline).map.toJSON();

    expect(second).toEqual(first);
});
