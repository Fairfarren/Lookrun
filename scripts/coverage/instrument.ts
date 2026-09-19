import path from 'node:path';
import { parse } from '@babel/parser';
import { createInstrumenter } from 'istanbul-lib-instrument';
import type { SourceFile } from '../crap/report';

export function instrumentSources(sources: SourceFile[]) {
    const instrumenter = createInstrumenter({
        esModules: true,
        parserPlugins: ['typescript', 'jsx'],
        coverageGlobalScope: 'globalThis',
        coverageGlobalScopeFunc: false,
    });
    const { prepareStackTrace, stackTraceLimit } = Error;
    try {
        return sources.map(({ file, source }) => {
            const ast = parse(source, {
                sourceType: 'unambiguous',
                plugins: ['typescript', 'jsx'],
            });
            if (ast.comments?.some(({ value }) => /(?:istanbul|c8|v8) ignore/.test(value))) {
                throw new Error(`源码包含覆盖率豁免指令：${file}`);
            }
            const absolutePath = path.resolve(file);
            const code = instrumenter.instrumentSync(source, absolutePath);
            return {
                file,
                absolutePath,
                code,
                loader: file.endsWith('x') ? ('tsx' as const) : ('ts' as const),
                coverage: instrumenter.lastFileCoverage(),
            };
        });
    } finally {
        // Babel 会改写全局堆栈钩子，Bun 下会使随后加载的 Vite 自定义错误构造失败。
        Error.prepareStackTrace = prepareStackTrace;
        Error.stackTraceLimit = stackTraceLimit;
    }
}
