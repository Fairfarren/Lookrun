import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { installProcessErrorHandlers, processErrorLogLine } from '@server/lib/process-errors';

describe('processErrorLogLine', () => {
    test('Error 取 message', () => {
        expect(processErrorLogLine('未处理的 Promise 拒绝', new Error('boom'))).toBe(
            '未处理的 Promise 拒绝：boom',
        );
    });

    test('非 Error 转成字符串', () => {
        expect(processErrorLogLine('未捕获异常', 'down')).toBe('未捕获异常：down');
    });
});

describe('installProcessErrorHandlers', () => {
    test('注册未处理拒绝和未捕获异常监听', () => {
        const events: string[] = [];
        const fake = {
            on(event: string) {
                events.push(event);
                return fake;
            },
        } as unknown as NodeJS.Process;

        installProcessErrorHandlers(fake);

        expect(events).toEqual(['unhandledRejection', 'uncaughtException']);
    });

    test('未处理的 Promise 拒绝不会结束进程', async () => {
        const modulePath = path.join(import.meta.dir, '../src/lib/process-errors.ts');
        const proc = Bun.spawn({
            cmd: [
                'bun',
                '-e',
                `import { installProcessErrorHandlers } from ${JSON.stringify(modulePath)};
installProcessErrorHandlers(process);
Promise.reject(new Error('boom'));
setTimeout(() => {
  process.stdout.write('ALIVE');
  process.exit(0);
}, 50);`,
            ],
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe('ALIVE');
    });
});
