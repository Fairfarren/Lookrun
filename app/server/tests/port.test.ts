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
