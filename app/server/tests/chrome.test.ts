import { test, expect } from 'bun:test';
import {
    chromeCandidatePaths,
    detectChromeWith,
    firstExistingPath,
    parseMdfindOutput,
    parseWhichOutput,
    parseWindowsRegOutput,
    queryChromeBySystem,
    queryChromeLinux,
    queryChromeMac,
    queryChromeWindows,
} from '@server/services/chrome';

// Windows 注册表 reg query 输出：取 REG_SZ 后面的路径
test('parseWindowsRegOutput 从注册表输出中提取 chrome 路径', () => {
    // 中文 Windows 的默认值名不影响解析，靠 REG_SZ 关键字定位
    const output = [
        '',
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
        '    (默认)    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        '',
    ].join('\r\n');
    expect(parseWindowsRegOutput(output)).toBe(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    );
});

test('parseWindowsRegOutput 没有 REG_SZ 行时返回 null', () => {
    const output = 'ERROR: The system was unable to find the specified registry key or value.';
    expect(parseWindowsRegOutput(output)).toBeNull();
});

// macOS mdfind 输出：取 .app 路径并拼上可执行文件
test('parseMdfindOutput 拼出 Chrome 可执行文件完整路径', () => {
    const output = ['/Applications/Google Chrome.app', ''].join('\n');
    expect(parseMdfindOutput(output)).toBe(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
});

test('parseMdfindOutput 多个结果时取第一个 .app', () => {
    const output = [
        '/Applications/Google Chrome.app',
        '/Users/test/Applications/Google Chrome.app',
    ].join('\n');
    expect(parseMdfindOutput(output)).toBe(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
});

test('parseMdfindOutput 空输出返回 null', () => {
    expect(parseMdfindOutput('')).toBeNull();
});

// Linux which 输出：取第一行
test('parseWhichOutput 取第一行可执行文件路径', () => {
    const output = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', ''].join('\n');
    expect(parseWhichOutput(output)).toBe('/usr/bin/google-chrome');
});

test('parseWhichOutput 空输出返回 null', () => {
    expect(parseWhichOutput('')).toBeNull();
});

test('候选路径按平台生成', () => {
    expect(chromeCandidatePaths({ platform: 'darwin', env: { HOME: '/h' } })[0]).toContain(
        'Google Chrome',
    );
    expect(
        chromeCandidatePaths({
            platform: 'win32',
            env: { PROGRAMFILES: 'C:\\P' },
        })[0],
    ).toContain('chrome.exe');
    expect(chromeCandidatePaths({ platform: 'linux', env: {} })[0]).toContain('google-chrome');
});

test('探测 Chrome 的三级回退', () => {
    expect(firstExistingPath(['/a', '/b'], (p) => p === '/b')).toBe('/b');
    expect(firstExistingPath(['/a'], () => false)).toBeNull();
    expect(
        detectChromeWith({
            envPath: '/env',
            exists: (p) => p === '/env',
            candidates: [],
            queryBySystem: () => ({ path: null, source: 'none' }),
        }).source,
    ).toBe('env');
    expect(
        detectChromeWith({
            envPath: undefined,
            exists: (p) => p === '/c',
            candidates: ['/c'],
            queryBySystem: () => ({ path: null, source: 'none' }),
        }).source,
    ).toBe('detected');
    expect(
        detectChromeWith({
            envPath: undefined,
            exists: () => false,
            candidates: [],
            queryBySystem: () => ({ path: '/q', source: 'which' }),
        }).path,
    ).toBe('/q');
});

test('系统查询按平台解析', () => {
    expect(
        queryChromeWindows({
            run: () => '    (默认)    REG_SZ    C:\\chrome.exe\n',
            exists: () => true,
        }).source,
    ).toBe('registry');
    expect(
        queryChromeMac({
            run: () => '/Applications/Google Chrome.app\n',
            exists: () => true,
        }).source,
    ).toBe('spotlight');
    expect(
        queryChromeLinux({
            run: () => '/usr/bin/google-chrome\n',
            exists: () => true,
        }).source,
    ).toBe('which');
    expect(
        queryChromeBySystem({
            platform: 'linux',
            run: () => {
                throw new Error('fail');
            },
            exists: () => false,
        }).source,
    ).toBe('none');
});
