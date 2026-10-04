import path from 'node:path';

export function resolveServerPort(value: string | undefined) {
    if (value === undefined || value === '') return 3877;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || 65535 < port) {
        throw new Error(`SERVER_PORT 必须是 0 到 65535 的整数，当前为：${value}`);
    }
    return port;
}

export const SERVER_PORT = resolveServerPort(process.env.SERVER_PORT);

// 数据目录：打包后为可执行文件同级的 data/，开发时为项目根的 data/
// 判断依据：开发时 process.execPath 是 bun 本身，打包后是产物可执行文件
export function resolveDataDir(input: {
    environmentPath: string | undefined;
    executablePath: string;
    cwd: string;
    platform: string;
}) {
    if (input.environmentPath) {
        return input.environmentPath;
    }
    const pathApi = input.platform === 'win32' ? path.win32 : path.posix;
    const execName = pathApi.basename(input.executablePath).toLowerCase();
    const isBunRuntime = execName.startsWith('bun');
    const baseDir = isBunRuntime ? input.cwd : pathApi.dirname(input.executablePath);
    return pathApi.join(baseDir, 'data');
}

export const DATA_DIR = resolveDataDir({
    environmentPath: process.env.TEST_WEB_AI_DATA_DIR,
    executablePath: process.execPath,
    cwd: process.cwd(),
    platform: process.platform,
});
export const DB_PATH = path.join(DATA_DIR, 'app.db');
export const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
export const REPORT_DIR = path.join(DATA_DIR, 'midscene-report');

// 历史记录最多保留的运行次数，超出后自动清理（含截图）
export const RUN_KEEP_COUNT = 100;
