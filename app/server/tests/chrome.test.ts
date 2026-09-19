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
} from '../src/services/chrome';

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

import { createChromeDetector } from '../src/services/chrome';

test('Windows 候选路径使用 Windows 路径语义并保留搜索优先级', () => {
    const env = {
        PROGRAMFILES: 'C:\\Program Files',
        'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\测试\\AppData\\Local',
    };

    const paths = chromeCandidatePaths({ platform: 'win32', env });

    expect(paths).toEqual([
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\测试\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ]);
});

test('macOS HOME 缺失时仍保留系统安装路径', () => {
    expect(chromeCandidatePaths({ platform: 'darwin', env: {} })).toEqual([
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]);
});

test('注册表只有空白值时返回未找到', () => {
    expect(parseWindowsRegOutput('REG_SZ    ')).toBeNull();
});

test('Spotlight 跳过非 Chrome 结果', () => {
    expect(parseMdfindOutput('/Applications/Other.app\n')).toBeNull();
});

test.each(['win32', 'darwin', 'linux'])(
    '系统查询返回不存在的路径时不报告可用 Chrome：%s',
    (platform) => {
        const output = {
            win32: 'REG_SZ C:\\removed\\chrome.exe\n',
            darwin: '/removed/Google Chrome.app\n',
            linux: '/removed/chrome\n',
        }[platform]!;

        const detected = queryChromeBySystem({ platform, run: () => output, exists: () => false });

        expect(detected).toEqual({ path: null, source: 'none' });
    },
);

test.each(['win32', 'darwin', 'linux'])('公开探测入口以本平台命令输出解析路径：%s', (platform) => {
    const commands = new Map([
        [
            'reg query HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe /ve',
            'REG_SZ C:\\portable\\chrome.exe\n',
        ],
        ["mdfind kMDItemFSName == 'Google Chrome.app'", '/portable/Google Chrome.app\n'],
        [
            'sh -c which google-chrome google-chrome-stable chromium chromium-browser 2>/dev/null',
            '/portable/chrome\n',
        ],
    ]);
    const expected = (
        {
            win32: { path: 'C:\\portable\\chrome.exe', source: 'registry' },
            darwin: {
                path: '/portable/Google Chrome.app/Contents/MacOS/Google Chrome',
                source: 'spotlight',
            },
            linux: { path: '/portable/chrome', source: 'which' },
        } as const
    )[platform]!;
    const detect = createChromeDetector({
        platform,
        env: {},
        exists: (file) => file === expected.path,
        spawn: (args) => ({ stdout: Buffer.from(commands.get(args.join(' ')) ?? '') }),
    });

    expect(detect()).toEqual(expected);
});

test('CHROME_PATH 优先于 MIDSCENE_CHROME_PATH 和固定安装路径', () => {
    const detect = createChromeDetector({
        platform: 'linux',
        env: { CHROME_PATH: '/chosen/chrome', MIDSCENE_CHROME_PATH: '/fallback/chrome' },
        exists: () => true,
        spawn: () => {
            throw new Error('不应查询系统');
        },
    });

    expect(detect()).toEqual({ path: '/chosen/chrome', source: 'env' });
});

test('未配置 CHROME_PATH 时使用 MIDSCENE_CHROME_PATH', () => {
    const detect = createChromeDetector({
        platform: 'linux',
        env: { MIDSCENE_CHROME_PATH: '/fallback/chrome' },
        exists: (file) => file === '/fallback/chrome',
        spawn: () => {
            throw new Error('不应查询系统');
        },
    });

    expect(detect()).toEqual({ path: '/fallback/chrome', source: 'env' });
});

test('环境路径失效时继续使用固定候选路径', () => {
    const detect = createChromeDetector({
        platform: 'linux',
        env: { CHROME_PATH: '/missing/chrome' },
        exists: (file) => file === '/usr/bin/google-chrome',
        spawn: () => {
            throw new Error('不应查询系统');
        },
    });

    expect(detect()).toEqual({ path: '/usr/bin/google-chrome', source: 'detected' });
});

test.each([null, undefined])('系统命令无输出时返回未找到：%p', (stdout) => {
    const detect = createChromeDetector({
        platform: 'linux',
        env: {},
        exists: () => false,
        spawn: () => ({ stdout }),
    });

    expect(detect()).toEqual({ path: null, source: 'none' });
});

test('缺少系统查询命令时返回未找到', () => {
    const detect = createChromeDetector({
        platform: 'darwin',
        env: {},
        exists: () => false,
        spawn: () => {
            throw new Error('找不到 mdfind');
        },
    });

    expect(detect()).toEqual({ path: null, source: 'none' });
});
