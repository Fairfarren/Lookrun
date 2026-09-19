import path from 'node:path';
import { smokeIo, type SmokeIo } from '../../scripts/smoke-common';
import type { RunDetail } from '../../scripts/e2e-smoke';

export function runDetail(status: string, fixtureUrl: string): RunDetail {
    const count = status === 'failed' ? 3 : 4;
    return {
        run: { status, error: status === 'failed' ? '第 3 步失败' : null },
        steps: Array.from({ length: count }, (_, index) => ({
            stepIndex: index,
            status: status === 'failed' && index === 2 ? 'failed' : 'success',
            shotBefore: 'shot.jpg',
            shotAfter: 'shot.jpg',
            url: fixtureUrl,
        })),
    };
}

export function smokeFixture() {
    const state = {
        now: 0,
        directoryExists: false,
        fixtureOpen: false,
        childAlive: false,
        socketClosed: true,
        failAt: -1,
        stopping: false,
        stopped: false,
        failurePath: '',
        healthStatus: 200,
        startupExit: null as number | null,
        writes: new Map<string, string>(),
        files: new Map<string, string>(),
        lastEnvironment: {} as Record<string, string>,
        serverCwd: '',
        fixtureUrl: 'http://127.0.0.1:43110/',
        packaged: false,
        assetStatus: 200,
        assetType: '',
        html: '<!doctype html><div id="root"></div><script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">',
        fallback: null as string | null,
        socket: null as FakeSocket | null,
    };
    class FakeSocket {
        readyState = WebSocket.OPEN;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
            state.socket = this;
            state.socketClosed = false;
        }
        close() {
            state.socketClosed = true;
        }
        emit(type: string) {
            this.onmessage?.({ data: JSON.stringify({ type }) });
        }
    }
    const io = {
        ...smokeIo,
        environment: {},
        tempRoot: '/temporary',
        now: () => state.now,
        sleep: async () => {
            state.now += 50;
        },
        mkdtemp: async () => {
            state.directoryExists = true;
            return '/temporary/isolated';
        },
        rm: async () => {
            state.directoryExists = false;
        },
        write: async (file: string, text: string) => {
            state.writes.set(file, text);
            return text.length;
        },
        file: (file: string) => ({
            exists: async () => state.files.has(file),
            get size() {
                return state.files.get(file)?.length ?? 0;
            },
            json: async () => JSON.parse(state.files.get(file)!),
        }),
        serve: () => {
            state.fixtureOpen = true;
            return {
                port: 43110,
                stop: async () => {
                    state.fixtureOpen = false;
                },
            };
        },
        spawn: (options: { env: Record<string, string>; cwd: string }) => {
            state.childAlive = true;
            state.failAt = Number(options.env.MOCK_FAIL_AT);
            state.lastEnvironment = options.env;
            state.serverCwd = options.cwd;
            return {
                exitCode: state.startupExit,
                stdout: new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                'AI 自动化测试服务已启动：http://localhost:43111\n',
                            ),
                        );
                        controller.close();
                    },
                }),
                kill: () => {
                    state.childAlive = false;
                },
                exited: Promise.resolve(0),
            };
        },
        WebSocket: FakeSocket,
        fetch: async (url: URL, options?: RequestInit) => {
            const pathname = url.pathname;
            if (pathname === state.failurePath) throw new Error('模拟请求失败');
            if (pathname === '/api/health')
                return Response.json({ ok: true }, { status: state.healthStatus });
            if (pathname === '/api/tasks') {
                const body = JSON.parse(String(options?.body));
                state.stopping = body.yaml.includes('sleep: 30000');
                state.stopped = false;
                return Response.json({ id: 1 }, { status: 201 });
            }
            if (pathname === '/api/runs') {
                state.socket?.emit('frame');
                for (let i = 0; i < 4; i++) state.socket?.emit('step');
                return Response.json({ runId: 1, queued: false });
            }
            if (pathname === '/api/runs/1') {
                if (state.stopping) {
                    const detail = runDetail(
                        state.stopped ? 'stopped' : 'running',
                        state.fixtureUrl,
                    );
                    detail.steps = detail.steps.slice(0, 1);
                    return Response.json(detail);
                }
                return Response.json(
                    runDetail(state.failAt === 2 ? 'failed' : 'success', state.fixtureUrl),
                );
            }
            if (pathname === '/api/runs/current/stop') {
                state.stopped = true;
                return Response.json({ ok: true });
            }
            if (pathname === '/api/runs/current')
                return Response.json({ status: 'idle', run: null });
            if (pathname === '/api/screenshots/shot.jpg') return new Response('image');
            if (pathname === '/')
                return new Response(state.html, { headers: { 'content-type': 'text/html' } });
            if (pathname === '/tasks') return new Response(state.fallback ?? state.html);
            if (pathname.startsWith('/assets/'))
                return new Response('asset', {
                    status: state.assetStatus,
                    headers: {
                        'content-type':
                            state.assetType ||
                            (pathname.endsWith('.css') ? 'text/css' : 'application/javascript'),
                    },
                });
            return new Response('不存在', { status: 404 });
        },
    } as unknown as SmokeIo;
    return { state, io, client: { base: 'http://127.0.0.1:43111', io } };
}

export function addArtifacts(fixture: ReturnType<typeof smokeFixture>, directory: string) {
    directory = path.resolve(directory);
    const platformKey = `${process.platform}-${process.arch}`;
    const windows = process.platform === 'win32';
    const paths = [
        windows ? 'test-web-use-ai.exe' : 'test-web-use-ai',
        windows ? 'runtime-tools/ffmpeg.exe' : 'runtime-tools/ffmpeg',
        'runtime-tools/scrcpy-server',
        windows ? 'platform-tools/adb.exe' : 'platform-tools/adb',
        `node_modules/@img/sharp-${platformKey}/lib/sharp-${platformKey}.node`,
    ];
    if (windows) paths.push('platform-tools/AdbWinApi.dll', 'platform-tools/AdbWinUsbApi.dll');
    for (const file of paths) fixture.state.files.set(path.join(directory, file), 'binary');
    fixture.state.files.set(
        path.join(directory, `node_modules/@img/sharp-${platformKey}/package.json`),
        JSON.stringify({ name: `@img/sharp-${platformKey}` }),
    );
}
