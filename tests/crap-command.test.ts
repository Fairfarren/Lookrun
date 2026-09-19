import { expect, test } from 'bun:test';
import { runCrapCommand, runCrapCheck } from '../scripts/crap-check';

test.each([true, false])('CRAP命令消费已有覆盖率并设置退出状态：%s', async (covered) => {
    const output: string[] = [];
    const state = { exitCode: 0 };
    const io: NonNullable<Parameters<typeof runCrapCommand>[1]> = {
        loadSources: async () => [
            { file: 'a.ts', source: 'function sample(x) { if(x) return x; return x || 0; }' },
        ],
        file: (() => ({
            exists: async () => true,
            text: async () => `SF:a.ts\nDA:1,${covered ? 1 : 0}\nend_of_record`,
        })) as unknown as typeof Bun.file,
        stdout: {
            write: (text: string) => {
                output.push(text);
            },
        } as unknown as typeof process.stdout,
        process: state as unknown as NodeJS.Process,
    };

    await runCrapCommand({ main: true }, io);

    expect({ exit: state.exitCode, report: output[0] }).toEqual({
        exit: covered ? 0 : 1,
        report: expect.stringContaining(`**结论**: ${covered ? '通过' : '不通过'}`),
    });
});

test('CRAP报告不存在时给出补跑指令', async () => {
    const io = {
        loadSources: async () => [],
        file: (() => ({ exists: async () => false })) as unknown as typeof Bun.file,
    };

    await expect(runCrapCheck(io)).rejects.toThrow('请先运行 bun run test:quality');
});

test('CRAP模块导入时不执行命令', async () => {
    let loaded = false;

    await runCrapCommand(
        { main: false },
        {
            loadSources: async () => {
                loaded = true;
                return [];
            },
        },
    );

    expect(loaded).toBe(false);
});
