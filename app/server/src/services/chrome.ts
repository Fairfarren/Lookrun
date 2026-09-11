import { existsSync } from 'node:fs';
import path from 'node:path';

export interface ChromeDetection {
    path: string | null;
    // env 环境变量 / detected 固定路径 / registry 注册表(Win) / spotlight Spotlight(Mac) / which which命令(Linux) / none 未找到
    source: 'env' | 'detected' | 'registry' | 'spotlight' | 'which' | 'none';
}

export function chromeCandidatePaths(input: {
    platform: string;
    env: Record<string, string | undefined>;
}) {
    if (input.platform === 'darwin') {
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(
                input.env.HOME ?? '',
                'Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            ),
        ];
    }
    if (input.platform === 'win32') {
        const prefixes = [
            input.env.PROGRAMFILES,
            input.env['PROGRAMFILES(X86)'],
            input.env.LOCALAPPDATA,
        ].filter((item): item is string => Boolean(item));
        return prefixes.map((prefix) => path.join(prefix, 'Google/Chrome/Application/chrome.exe'));
    }
    return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser'];
}

function candidatePaths() {
    return chromeCandidatePaths({ platform: process.platform, env: process.env });
}

export function firstExistingPath(paths: string[], exists: (filePath: string) => boolean) {
    for (const filePath of paths) {
        if (exists(filePath)) {
            return filePath;
        }
    }
    return null;
}

// 解析 Windows `reg query ... /ve` 输出，提取 REG_SZ 后面的 chrome.exe 路径
export function parseWindowsRegOutput(output: string): string | null {
    // 默认值名在中文/英文系统里不同（"(默认)" vs "(Default)"），但 REG_SZ 关键字稳定
    const match = output.match(/REG_SZ\s+(.+?)(?:\r?\n|$)/);
    if (!match) {
        return null;
    }
    const p = match[1].trim();
    return p === '' ? null : p;
}

// 解析 macOS `mdfind` 输出：取第一个 Google Chrome.app 并拼上可执行文件路径
export function parseMdfindOutput(output: string): string | null {
    const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    for (const line of lines) {
        if (line.endsWith('Google Chrome.app')) {
            return path.join(line, 'Contents/MacOS/Google Chrome');
        }
    }
    return null;
}

// 解析 Linux `which` 输出：取第一行存在的可执行文件路径
export function parseWhichOutput(output: string): string | null {
    const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    return lines[0] ?? null;
}

// 固定路径都没命中时，回退到系统命令查询（注册表/Spotlight/which）
// 用 spawnSync 同步执行，探测只在启动/运行任务时各一次，阻塞几十毫秒可接受，
// 保持 detectChrome 同步签名，避免改动三处调用方
export function queryChromeWindows(input: {
    run: (argv: string[]) => string;
    exists: (filePath: string) => boolean;
}) {
    const keys = [
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
        'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
        'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    ];
    for (const key of keys) {
        const parsed = parseWindowsRegOutput(input.run(['reg', 'query', key, '/ve']));
        if (parsed && input.exists(parsed)) {
            return { path: parsed, source: 'registry' as const };
        }
    }
    return { path: null, source: 'none' as const };
}

export function queryChromeMac(input: {
    run: (argv: string[]) => string;
    exists: (filePath: string) => boolean;
}) {
    const parsed = parseMdfindOutput(input.run(['mdfind', "kMDItemFSName == 'Google Chrome.app'"]));
    if (parsed && input.exists(parsed)) {
        return { path: parsed, source: 'spotlight' as const };
    }
    return { path: null, source: 'none' as const };
}

export function queryChromeLinux(input: {
    run: (argv: string[]) => string;
    exists: (filePath: string) => boolean;
}) {
    const parsed = parseWhichOutput(
        input.run([
            'sh',
            '-c',
            'which google-chrome google-chrome-stable chromium chromium-browser 2>/dev/null',
        ]),
    );
    if (parsed && input.exists(parsed)) {
        return { path: parsed, source: 'which' as const };
    }
    return { path: null, source: 'none' as const };
}

export function queryChromeBySystem(input: {
    platform: string;
    run: (argv: string[]) => string;
    exists: (filePath: string) => boolean;
}): ChromeDetection {
    try {
        if (input.platform === 'win32') {
            return queryChromeWindows(input);
        }
        if (input.platform === 'darwin') {
            return queryChromeMac(input);
        }
        return queryChromeLinux(input);
    } catch {
        return { path: null, source: 'none' };
    }
}

function spawnOutput(argv: string[]) {
    return Bun.spawnSync(argv).stdout?.toString() ?? '';
}

function queryBySystem() {
    return queryChromeBySystem({
        platform: process.platform,
        run: spawnOutput,
        exists: existsSync,
    });
}

export function detectChromeWith(input: {
    envPath: string | undefined;
    exists: (filePath: string) => boolean;
    candidates: string[];
    queryBySystem: () => ChromeDetection;
}): ChromeDetection {
    if (input.envPath && input.exists(input.envPath)) {
        return { path: input.envPath, source: 'env' };
    }
    const detected = firstExistingPath(input.candidates, input.exists);
    if (detected) {
        return { path: detected, source: 'detected' };
    }
    return input.queryBySystem();
}

// 探测系统 Chrome：环境变量 → 固定安装路径 → 系统命令查询（注册表/Spotlight/which）
export function detectChrome(): ChromeDetection {
    return detectChromeWith({
        envPath: process.env.CHROME_PATH ?? process.env.MIDSCENE_CHROME_PATH,
        exists: existsSync,
        candidates: candidatePaths(),
        queryBySystem,
    });
}
