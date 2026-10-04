import { test, expect } from 'bun:test';
import { parseLsofPids, parseNetstatPids } from '../src/lib/port';

// macOS/Linux: lsof -ti :PORT 输出每行一个 PID
test('parseLsofPids 提取每行的 PID', () => {
    const output = ['12345', '67890', ''].join('\n');
    expect(parseLsofPids(output)).toEqual([12345, 67890]);
});

test('parseLsofPids 忽略空行和非数字', () => {
    const output = ['12345', '', 'abc', '67890'].join('\n');
    expect(parseLsofPids(output)).toEqual([12345, 67890]);
});

test('parseLsofPids 空输入返回空数组', () => {
    expect(parseLsofPids('')).toEqual([]);
});

// Windows: netstat -ano 输出，只取 LISTENING 行的末尾 PID
test('parseNetstatPids 取 LISTENING 行的 PID', () => {
    const output = [
        '  TCP    0.0.0.0:3877           0.0.0.0:0              LISTENING       12345',
        '  TCP    [::]:3877              [::]:0                 LISTENING       12345',
    ].join('\n');
    expect(parseNetstatPids(output, 3877)).toEqual([12345, 12345]);
});

test('parseNetstatPids 忽略非 LISTENING 的连接（ESTABLISHED 等）', () => {
    const output = [
        '  TCP    192.168.1.5:3877       10.0.0.1:443           ESTABLISHED     999',
        '  TCP    0.0.0.0:3877           0.0.0.0:0              LISTENING       12345',
    ].join('\n');
    expect(parseNetstatPids(output, 3877)).toEqual([12345]);
});

test('parseNetstatPids 只匹配指定端口，不误杀 38770 之类', () => {
    const output = [
        '  TCP    0.0.0.0:38770          0.0.0.0:0              LISTENING       88888',
        '  TCP    0.0.0.0:3877           0.0.0.0:0              LISTENING       12345',
    ].join('\n');
    expect(parseNetstatPids(output, 3877)).toEqual([12345]);
});

test('parseNetstatPids 空输入返回空数组', () => {
    expect(parseNetstatPids('', 3877)).toEqual([]);
});

import { createPortCleaner, findPortPidsWith } from '../src/lib/port';

function portFixture(platform: string) {
    const listening = new Set([11, 29]);
    const signaled = new Set<number>();
    const warnings: string[] = [];
    const messages: string[] = [];
    const state: { elapsed: number; releaseAfter: number | undefined } = {
        elapsed: 0,
        releaseAfter: 0,
    };
    const clean = createPortCleaner({
        platform,
        selfPid: 11,
        spawn(command, args) {
            if (command === 'lsof' && args.join(' ') === '-ti :3877')
                return { stdout: [...listening].join('\n') };
            if (command === 'netstat' && args.join(' ') === '-ano')
                return {
                    stdout: [...listening]
                        .map((pid) => `TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING ${pid}`)
                        .join('\n'),
                };
            const pid = Number(args.at(-1));
            const expected = platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
            if (`${command} ${args.join(' ')}` !== expected) throw new Error('非预期的系统命令');
            signaled.add(pid);
            if (state.releaseAfter === 0) listening.delete(pid);
            return {};
        },
        wait(milliseconds) {
            state.elapsed += milliseconds;
            if (state.releaseAfter !== undefined && state.elapsed >= state.releaseAfter) {
                for (const pid of signaled) listening.delete(pid);
            }
        },
        log: (message) => messages.push(message),
        warn: (message) => warnings.push(message),
    });
    return { clean, listening, signaled, state, warnings, messages };
}

test.each(['linux', 'win32'])('端口清理只终止占用的其他进程：%s', (platform) => {
    const fixture = portFixture(platform);

    fixture.clean(3877);

    expect({
        listening: [...fixture.listening],
        signaled: [...fixture.signaled],
        warnings: fixture.warnings,
    }).toEqual({ listening: [11], signaled: [29], warnings: [] });
});

test('进程尚未释放端口时用虚拟时钟等待后继续查询', () => {
    const fixture = portFixture('win32');
    fixture.state.releaseAfter = 200;

    fixture.clean(3877);

    expect({
        elapsed: fixture.state.elapsed,
        listening: [...fixture.listening],
        warnings: fixture.warnings,
    }).toEqual({ elapsed: 200, listening: [11], warnings: [] });
});

test('端口一直占用时最多等待三秒并报告端口', () => {
    const fixture = portFixture('linux');
    fixture.state.releaseAfter = undefined;

    fixture.clean(3877);

    expect({ elapsed: fixture.state.elapsed, warnings: fixture.warnings }).toEqual({
        elapsed: 3000,
        warnings: ['端口 3877 清理后仍被占用，继续尝试启动'],
    });
});

test('仅自身持有端口时不清理也不产生占用日志', () => {
    const fixture = portFixture('linux');
    fixture.listening.delete(29);

    fixture.clean(3877);

    expect({
        listening: [...fixture.listening],
        messages: fixture.messages,
        elapsed: fixture.state.elapsed,
    }).toEqual({ listening: [11], messages: [], elapsed: 0 });
});

test.each([null, undefined])('系统命令没有标准输出时视为空闲：%p', (stdout) => {
    const messages: string[] = [];
    const clean = createPortCleaner({
        platform: 'linux',
        selfPid: 11,
        spawn: () => ({ stdout }),
        wait: () => {
            throw new Error('空闲端口不应等待');
        },
        log: (message) => messages.push(message),
        warn: (message) => messages.push(message),
    });

    clean(3877);

    expect(messages).toEqual([]);
});

test('系统查询异常向启动调用方传播', () => {
    const failure = new Error('无法创建查询进程');
    const clean = createPortCleaner({
        platform: 'win32',
        selfPid: 11,
        spawn: () => {
            throw failure;
        },
        wait: () => {},
        log: () => {},
        warn: () => {},
    });

    expect(() => clean(3877)).toThrow(failure);
});

test('Windows 查询过滤自身和其他端口', () => {
    const stdout = [
        'TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING 11',
        'TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING 29',
        'TCP 0.0.0.0:80 0.0.0.0:0 LISTENING 99',
    ].join('\n');

    const pids = findPortPidsWith({ platform: 'win32', selfPid: 11, stdout, port: 3877 });

    expect(pids).toEqual([29]);
});

test('Windows 解析接受制表符分隔并忽略缺失或为零的 PID', () => {
    const stdout = [
        'TCP 0.0.0.0:3877\t0.0.0.0:0 LISTENING 29',
        'TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING none',
        'TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING 0',
        `TCP 0.0.0.0:3877 0.0.0.0:0 LISTENING ${'9'.repeat(400)}`,
    ].join('\n');

    expect(parseNetstatPids(stdout, 3877)).toEqual([29]);
});

test('lsof 解析忽略零、负数和非有限值', () => {
    expect(parseLsofPids('0\n-1\nInfinity\n29\n')).toEqual([29]);
});
