import { existsSync } from 'node:fs';
import path from 'node:path';

export interface AndroidDeviceInfo {
    udid?: string;
    model?: string;
}

export interface AndroidDeviceOption {
    id: string;
    name: string;
}

interface AndroidAppLauncherInput {
    directLaunch: (target: string) => Promise<unknown>;
    prepareAppList: () => Promise<unknown>;
    readUi: () => Promise<string>;
    scrollAppList: () => Promise<unknown>;
    tap: (point: { x: number; y: number }) => Promise<unknown>;
    waitAfterTap: () => Promise<unknown>;
}

const ANDROID_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+(?:\/[a-z0-9_.$]+)?$/i;
const ANDROID_PACKAGE_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const ANDROID_APP_LIST_MAX_PAGES = 12;

function decodeXmlAttribute(value: string) {
    const entities: Record<string, string> = {
        '&amp;': '&',
        '&apos;': "'",
        '&gt;': '>',
        '&lt;': '<',
        '&quot;': '"',
    };
    return value.replace(/&(amp|apos|gt|lt|quot);/g, (entity) => entities[entity]);
}

function normalizeAppName(value: string) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\s_-]+/gu, '');
}

function nodeAttributes(source: string) {
    return Object.fromEntries(
        Array.from(source.matchAll(/([\w:-]+)="([^"]*)"/g), ([, key, value]) => [
            key,
            decodeXmlAttribute(value),
        ]),
    );
}

export function findLauncherAppCenter(uiXml: string, appName: string) {
    const expectedName = normalizeAppName(appName);
    for (const match of uiXml.matchAll(/<node\b([^>]*)>/g)) {
        const attributes = nodeAttributes(match[1]);
        if (attributes.clickable !== 'true' || attributes.enabled === 'false') {
            continue;
        }
        const names = [attributes.text, attributes['content-desc']].filter(Boolean);
        if (!names.some((name) => normalizeAppName(name) === expectedName)) {
            continue;
        }
        const bounds = attributes.bounds?.match(/^\[(\d+),(\d+)]\[(\d+),(\d+)]$/);
        if (!bounds) {
            continue;
        }
        const [, left, top, right, bottom] = bounds.map(Number);
        return {
            x: Math.floor((left + right) / 2),
            y: Math.floor((top + bottom) / 2),
        };
    }
    return null;
}

export function parseAndroidScreenSize(output: string) {
    const matches = Array.from(output.matchAll(/(\d+)x(\d+)/g));
    const match = matches.at(-1);
    if (!match) {
        throw new Error(`无法解析 Android 屏幕尺寸：${output.trim()}`);
    }
    return { width: Number(match[1]), height: Number(match[2]) };
}

export function isDirectAndroidLaunchTarget(target: string) {
    const value = target.trim();
    return ANDROID_PACKAGE_PATTERN.test(value) || URI_SCHEME_PATTERN.test(value);
}

export function parseAndroidLauncherPackages(output: string) {
    const packageNames = new Set<string>();
    for (const line of output.split(/\r?\n/)) {
        const [packageName, activityName] = line.trim().split('/', 2);
        if (activityName && ANDROID_PACKAGE_NAME_PATTERN.test(packageName)) {
            packageNames.add(packageName);
        }
    }
    return Array.from(packageNames)
        .sort((left, right) => left.localeCompare(right))
        .map((packageName) => ({ packageName }));
}

export function createAndroidAppLauncher(input: AndroidAppLauncherInput) {
    return async (target: string) => {
        const value = target.trim();
        if (isDirectAndroidLaunchTarget(value)) {
            await input.directLaunch(value);
            return;
        }

        // App 显示名由当前设备桌面提供，避免使用可能与安装版本不一致的固定包名映射。
        await input.prepareAppList();
        const visitedPages = new Set<string>();
        for (let page = 0; page < ANDROID_APP_LIST_MAX_PAGES; page += 1) {
            const uiXml = await input.readUi();
            const targetCenter = findLauncherAppCenter(uiXml, value);
            if (targetCenter) {
                await input.tap(targetCenter);
                await input.waitAfterTap();
                return;
            }
            if (visitedPages.has(uiXml)) {
                break;
            }
            visitedPages.add(uiXml);
            await input.scrollAppList();
        }
        throw new Error(`设备的应用列表中没有找到名为「${value}」的 App，请检查名称或改填准确包名`);
    };
}

export function createAndroidDeviceLister(provider: () => Promise<AndroidDeviceInfo[]>) {
    return async () => {
        const devices = await provider();
        return devices.flatMap((device): AndroidDeviceOption[] => {
            if (!device.udid) {
                return [];
            }
            return [
                {
                    id: device.udid,
                    name: device.model || device.udid,
                },
            ];
        });
    };
}

export function createAndroidDeviceChecker(listDevices: () => Promise<AndroidDeviceOption[]>) {
    return async (deviceId: string) => {
        const devices = await listDevices();
        const device = devices.find((item) => item.id === deviceId);
        return device
            ? { ok: true as const, device }
            : {
                  ok: false as const,
                  message: `设备 ${deviceId} 未连接或未授权`,
              };
    };
}

interface ResolveAdbPathInput {
    platform: NodeJS.Platform;
    executableDir: string;
    environmentPath: string | undefined;
    sdkRoot: string | undefined;
    pathAdb: string | undefined;
    exists: (filePath: string) => boolean;
}

export function resolveAdbPath(input: ResolveAdbPathInput) {
    const adbName = input.platform === 'win32' ? 'adb.exe' : 'adb';
    const pathApi = input.platform === 'win32' ? path.win32 : path;
    const candidates = [
        pathApi.join(input.executableDir, 'platform-tools', adbName),
        input.environmentPath,
        input.sdkRoot ? pathApi.join(input.sdkRoot, 'platform-tools', adbName) : undefined,
        input.pathAdb,
    ];
    return (
        candidates.find((candidate): candidate is string =>
            Boolean(candidate && input.exists(candidate)),
        ) ?? null
    );
}

export function detectAdbPath() {
    const execName = path.basename(process.execPath).toLowerCase();
    const executableDir = execName.startsWith('bun')
        ? process.cwd()
        : path.dirname(process.execPath);
    return resolveAdbPath({
        platform: process.platform,
        executableDir,
        environmentPath: process.env.MIDSCENE_ADB_PATH,
        sdkRoot: process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT,
        pathAdb: Bun.which(process.platform === 'win32' ? 'adb.exe' : 'adb') ?? undefined,
        exists: existsSync,
    });
}
