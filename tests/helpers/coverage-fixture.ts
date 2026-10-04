import { runInNewContext } from 'node:vm';
import { createContext } from 'istanbul-lib-report';
import { instrumentSources } from '../../scripts/coverage/instrument';
import { writeCoverageReports } from '../../scripts/coverage/report';
import type { CoverageMapData } from 'istanbul-lib-coverage';
import type { runQualityCommand } from '../../scripts/test-quality';

export function memoryReportContext(files: Map<string, string>) {
    return ((options) => {
        const context = createContext(options);
        Object.defineProperty(context, 'writer', {
            value: {
                writeFile(file: string | null) {
                    let content = '';
                    return {
                        write(text: string) {
                            content += text;
                        },
                        println(text: string) {
                            content += `${text}\n`;
                        },
                        colorize(text: string) {
                            return text;
                        },
                        close() {
                            files.set(`coverage/${file ?? 'stdout'}`, content);
                        },
                    };
                },
            },
        });
        return context;
    }) as typeof createContext;
}

export function qualityFixture(options: {
    uncovered?: boolean;
    testFailure?: boolean;
    corrupt?: boolean;
}) {
    const source = 'function value() { return 42; }';
    const [entry] = instrumentSources([{ file: 'fixture.ts', source }]);
    const context: { __coverage__?: CoverageMapData } = {};
    runInNewContext(`${entry.code}\n${options.uncovered ? '' : 'value();'}`, context);
    const data = JSON.stringify(context.__coverage__);
    const files = new Map<string, string>();
    const processes: string[][] = [];
    const exit = { exitCode: 0 };
    type IO = NonNullable<Parameters<typeof runQualityCommand>[1]>;
    const io: IO = {
        remove: () => {
            files.clear();
        },
        mkdir: (() => undefined) as IO['mkdir'],
        loadSources: async () => [{ file: 'fixture.ts', source }],
        write: (async (file: string, content: string) => {
            files.set(file, content);
            return content.length;
        }) as IO['write'],
        file: ((file: string) => ({
            text: async () => files.get(file)!,
            json: async () => JSON.parse(files.get(file)!),
        })) as unknown as IO['file'],
        spawn: ((args: string[], input: { env: Record<string, string> }) => {
            processes.push(args);
            files.set(input.env.LOOKRUN_COVERAGE_OUTPUT, options.corrupt ? '{}' : data);
            return { exited: Promise.resolve(options.testFailure ? 1 : 0) };
        }) as unknown as IO['spawn'],
        writeReports: (report) => writeCoverageReports(report, memoryReportContext(files)),
        log: () => {},
        process: exit as unknown as NodeJS.Process,
    };
    return { io, exit, files, processes };
}
