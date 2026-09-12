// 启动前自动清理被占用的端口：找到占用进程并杀掉，避免上一次实例残留导致启动失败
import { spawnSync } from 'node:child_process';

// 解析 macOS/Linux 的 `lsof -ti :PORT` 输出，返回 PID 列表（每行一个数字）
export function parseLsofPids(output: string): number[] {
    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
}

// 解析 Windows 的 `netstat -ano` 输出，只取 LISTENING 行末尾的 PID
// 行格式示例：`  TCP    0.0.0.0:3877           0.0.0.0:0              LISTENING       12345`
export function parseNetstatPids(output: string, port: number): number[] {
    const pids: number[] = [];
    for (const line of output.split('\n')) {
        // 端口后紧跟空白才算精确匹配，避免 3877 误匹配 38770
        const portMatch = line.includes(`:${port} `) || line.includes(`:${port}\t`);
        if (!portMatch || !line.includes('LISTENING')) {
            continue;
        }
        // PID 在行尾
        const match = line.match(/\s(\d+)\s*$/);
        if (match) {
            const pid = Number(match[1]);
            if (Number.isFinite(pid) && pid > 0) {
                pids.push(pid);
            }
        }
    }
    return pids;
}

export function findPortPidsWith(input: {
    platform: string;
    selfPid: number;
    stdout: string;
    port: number;
}) {
    const pids =
        input.platform === 'win32'
            ? parseNetstatPids(input.stdout, input.port)
            : parseLsofPids(input.stdout);
    return pids.filter((pid) => pid !== input.selfPid);
}

function commandStdout(result: { stdout?: string | null }) {
    return result.stdout ?? '';
}

function readPortCommand(port: number) {
    if (process.platform === 'win32') {
        return commandStdout(spawnSync('netstat', ['-ano'], { encoding: 'utf8' }));
    }
    return commandStdout(spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' }));
}

function findPortPids(port: number) {
    return findPortPidsWith({
        platform: process.platform,
        selfPid: process.pid,
        stdout: readPortCommand(port),
        port,
    });
}

// 杀掉指定 PID（跨平台）
function killPid(pid: number) {
    const cmd =
        process.platform === 'win32'
            ? ['taskkill', '/F', '/PID', String(pid)]
            : ['kill', '-9', String(pid)];
    spawnSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
}

// 检测端口是否已释放（用 lsof/netstat 再查一次）
function isPortFree(port: number): boolean {
    return findPortPids(port).length === 0;
}

export function ensurePortFreeWith(input: {
    port: number;
    pids: number[];
    kill: (pid: number) => void;
    isFree: () => boolean;
    wait: () => void;
    maxWaits: number;
    log: (message: string) => void;
    warn: (message: string) => void;
}) {
    if (input.pids.length === 0) {
        return;
    }
    input.log(`端口 ${input.port} 被占用（PID: ${input.pids.join(', ')}），自动清理后启动...`);
    for (const pid of input.pids) {
        input.kill(pid);
    }
    for (let attempt = 0; attempt < input.maxWaits; attempt++) {
        if (input.isFree()) {
            return;
        }
        input.wait();
    }
    input.warn(`端口 ${input.port} 清理后仍被占用，继续尝试启动`);
}

export function ensurePortFree(port: number) {
    ensurePortFreeWith({
        port,
        pids: findPortPids(port),
        kill: killPid,
        isFree: () => isPortFree(port),
        wait: () => {
            spawnSync('sleep', ['0.1'], { stdio: 'ignore' });
        },
        maxWaits: 30,
        log: (message) => console.log(message),
        warn: (message) => console.warn(message),
    });
}
