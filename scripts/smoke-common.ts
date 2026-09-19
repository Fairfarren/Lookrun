import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const POLL_INTERVAL_MS = 50;
const REQUEST_TIMEOUT_MS = 5_000;
const SERVER_TIMEOUT_MS = 30_000;

export const smokeIo = {
    fetch,
    serve: Bun.serve,
    spawn: Bun.spawn,
    write: Bun.write,
    file: Bun.file,
    sleep: Bun.sleep,
    now: Date.now,
    mkdtemp,
    rm,
    WebSocket,
    tempRoot: tmpdir(),
    environment: process.env,
};

export type SmokeIo = typeof smokeIo;
export type SmokeClient = { base: string; io: SmokeIo };
export type PollInput<T> = {
    label: string;
    timeoutMs: number;
    read: () => Promise<T>;
    done: (value: T) => boolean;
};

export async function pollUntil<T>(input: PollInput<T>, io: Pick<SmokeIo, 'now' | 'sleep'>) {
    const deadline = io.now() + input.timeoutMs;
    while (io.now() < deadline) {
        const value = await input.read();
        if (input.done(value)) return value;
        await io.sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`${input.label}超时（${input.timeoutMs}ms）`);
}

export async function smokeRequest(
    client: SmokeClient,
    input: { pathname: string; method: string; body?: unknown; status: number },
) {
    const response = await client.io.fetch(new URL(input.pathname, client.base), {
        method: input.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert.equal(response.status, input.status, `${input.method} ${input.pathname} 状态错误`);
    return response;
}

export async function waitForIdle(client: SmokeClient) {
    return pollUntil(
        {
            label: '等待执行器清理',
            timeoutMs: SERVER_TIMEOUT_MS,
            read: async () => {
                const response = await smokeRequest(client, {
                    pathname: '/api/runs/current',
                    method: 'GET',
                    status: 200,
                });
                return response.json() as Promise<{ status: string }>;
            },
            done: (body) => body.status === 'idle',
        },
        client.io,
    );
}

export async function serviceReady(client: SmokeClient) {
    try {
        const response = await client.io.fetch(new URL('/api/health', client.base), {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function stopServer(
    input: { child: Pick<Bun.Subprocess, 'kill' | 'exited'>; ready: boolean },
    client: SmokeClient,
) {
    try {
        if (input.ready) {
            await smokeRequest(client, {
                pathname: '/api/runs/current/stop',
                method: 'POST',
                status: 200,
            });
            await waitForIdle(client);
        }
    } finally {
        input.child.kill('SIGKILL');
        await input.child.exited;
    }
}

export function captureOutput(stream: ReadableStream<Uint8Array>) {
    const output = { text: '', error: null as unknown };
    const decoder = new TextDecoder();
    const finished = stream
        .pipeTo(
            new WritableStream({
                write(chunk) {
                    output.text += decoder.decode(chunk, { stream: true });
                },
            }),
        )
        .catch((error: unknown) => {
            output.error = error;
        });
    return { output, finished };
}

export function startedServer(output: ReturnType<typeof captureOutput>['output']) {
    assert.equal(output.error, null, '读取服务输出失败');
    return /AI 自动化测试服务已启动：http:\/\/localhost:(\d+)\r?\n/.exec(output.text)?.[1];
}

export async function withServer<T>(
    input: {
        command: string[];
        cwd: string;
        dataDir: string;
        failAt: number;
        check: (client: SmokeClient) => Promise<T>;
    },
    io: SmokeIo,
) {
    const child = io.spawn({
        cmd: input.command,
        cwd: input.cwd,
        env: {
            ...io.environment,
            MOCK_AI: '1',
            MOCK_FAIL_AT: String(input.failAt),
            LOOKRUN_OPEN_BROWSER: '0',
            TEST_WEB_AI_DATA_DIR: input.dataDir,
            MIDSCENE_RUN_DIR: path.join(input.dataDir, 'reports'),
            SERVER_PORT: '0',
        },
        stdout: 'pipe',
        stderr: 'inherit',
        timeout: 120_000,
        killSignal: 'SIGKILL',
    });
    const output = captureOutput(child.stdout);
    const client = { base: '', io };
    let ready = false;
    try {
        const port = await pollUntil(
            {
                label: '等待服务启动',
                timeoutMs: SERVER_TIMEOUT_MS,
                read: async () => {
                    assert.equal(child.exitCode, null, `服务在就绪前退出：${output.output.text}`);
                    return startedServer(output.output);
                },
                done: Boolean,
            },
            io,
        );
        client.base = `http://127.0.0.1:${port}`;
        assert.ok(await serviceReady(client), '服务已监听但健康检查失败');
        ready = true;
        return await input.check(client);
    } finally {
        try {
            await stopServer({ child, ready }, client);
        } finally {
            await output.finished;
        }
    }
}

export async function withTempDirectory<T>(check: (directory: string) => Promise<T>, io: SmokeIo) {
    const directory = await io.mkdtemp(path.join(io.tempRoot, 'lookrun-smoke-'));
    try {
        return await check(directory);
    } finally {
        await io.rm(directory, { recursive: true, force: true });
    }
}
