import { expect, test } from 'bun:test';
import { resolveServerPort } from '../src/config';

test.each([undefined, ''])('未配置端口使用默认端口：%s', (value) => {
    expect(resolveServerPort(value)).toBe(3877);
});

test('端口零交给系统分配，不能回退固定端口', () => {
    expect(resolveServerPort('0')).toBe(0);
});

test.each(['-1', '65536', '1.5', 'abc'])('拒绝非法端口：%s', (value) => {
    expect(() => resolveServerPort(value)).toThrow('0 到 65535 的整数');
});

test('接受最大合法端口', () => {
    expect(resolveServerPort('65535')).toBe(65535);
});

import { resolveDataDir } from '../src/config';

test('显式数据目录优先于运行时和可执行文件位置', () => {
    expect(
        resolveDataDir({
            environmentPath: '/custom/data',
            executablePath: '/app/test-web-use-ai',
            cwd: '/workspace',
            platform: 'linux',
        }),
    ).toBe('/custom/data');
});

test('开发运行从工作目录解析数据目录', () => {
    expect(
        resolveDataDir({
            environmentPath: '',
            executablePath: '/opt/bun/bin/BUN',
            cwd: '/workspace',
            platform: 'darwin',
        }),
    ).toBe('/workspace/data');
});

test('打包程序从可执行文件同级解析数据目录', () => {
    expect(
        resolveDataDir({
            environmentPath: undefined,
            executablePath: '/app/test-web-use-ai',
            cwd: '/other',
            platform: 'linux',
        }),
    ).toBe('/app/data');
});

test('Windows 数据目录使用目标平台路径规则', () => {
    expect(
        resolveDataDir({
            environmentPath: undefined,
            executablePath: 'C:\\app\\test-web-use-ai.exe',
            cwd: 'D:\\workspace',
            platform: 'win32',
        }),
    ).toBe('C:\\app\\data');
});
