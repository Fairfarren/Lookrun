import { describe, expect, test } from 'bun:test';
import { errorText } from '../src/lib/error-text';
import { browserOpenCommand } from '../src/lib/open-browser';
import {
    missingIdError,
    modelSelectError,
    moveDirectionError,
    parsePositiveInt,
    parseRunListQuery,
    queueItemsOrEmpty,
    queueNameError,
    runStartBodyError,
    taskWriteError,
    variablesBodyError,
} from '../src/lib/route-input';
import { contentTypeFor, resolveStaticAsset } from '../src/lib/static';
import { sendJsonToClients, trySendWs } from '../src/lib/ws';
import { applyRuntimeAssetEnv } from '../src/lib/runtime-assets';
import { ensurePortFreeWith, findPortPidsWith } from '../src/lib/port';
import {
    applyQueueItemStart,
    namedQueueUnavailable,
    queueItemMissingError,
    queueItemStartError,
    startNamedQueueItems,
} from '../src/routes/queue-start';
import { ScriptInvalidError } from '../src/services/runner';

describe('errorText', () => {
    test('Error 取 message', () => {
        expect(errorText(new Error('boom'))).toBe('boom');
    });

    test('非 Error 转成字符串', () => {
        expect(errorText('x')).toBe('x');
    });
});

describe('browserOpenCommand', () => {
    test('macOS 用 open', () => {
        expect(browserOpenCommand('darwin', 'http://x')).toEqual(['open', 'http://x']);
    });

    test('Windows 用 start', () => {
        expect(browserOpenCommand('win32', 'http://x')).toEqual(['cmd', '/c', 'start', 'http://x']);
    });

    test('其他系统用 xdg-open', () => {
        expect(browserOpenCommand('linux', 'http://x')).toEqual(['xdg-open', 'http://x']);
    });
});

describe('route-input', () => {
    test('任务名或 yaml 为空时报错', () => {
        expect(taskWriteError({ name: ' ', yaml: 'a' })).toBe('任务名和 YAML 内容不能为空');
        expect(taskWriteError({ name: 'a', yaml: '' })).toBe('任务名和 YAML 内容不能为空');
        expect(taskWriteError({ name: 'a', yaml: 'b' })).toBeNull();
    });

    test('队列名校验', () => {
        expect(queueNameError(' ')).toBe('队列名不能为空');
        expect(queueNameError('每日')).toBeNull();
    });

    test('移动方向校验', () => {
        expect(moveDirectionError('up')).toBeNull();
        expect(moveDirectionError('down')).toBeNull();
        expect(moveDirectionError('left')).toBe('direction 必须是 up 或 down');
    });

    test('解析分页参数', () => {
        expect(parsePositiveInt(undefined, 20)).toBe(20);
        expect(parsePositiveInt('0', 20)).toBe(20);
        expect(parsePositiveInt('5', 20)).toBe(5);
        expect(parseRunListQuery({ limit: '200', offset: '3' })).toEqual({ limit: 100, offset: 3 });
    });

    test('模型选择和启动参数', () => {
        expect(modelSelectError(undefined, false)).toBe('模型不存在');
        expect(modelSelectError('m1', false)).toBe('模型不存在');
        expect(modelSelectError('m1', true)).toBeNull();
        expect(runStartBodyError(undefined, 'm')).toBe('缺少 taskId 或 modelId');
        expect(runStartBodyError(1, undefined)).toBe('缺少 taskId 或 modelId');
        expect(runStartBodyError(1, 'm')).toBeNull();
    });

    test('variables 必须是对象', () => {
        expect(variablesBodyError(undefined)).toBe('variables 必须是对象');
        expect(variablesBodyError('x')).toBe('variables 必须是对象');
        expect(variablesBodyError({})).toBeNull();
    });

    test('缺少 id', () => {
        expect(missingIdError(' ', '请选择')).toBe('请选择');
        expect(missingIdError('dev', '请选择')).toBeNull();
    });

    test('队列条目缺省为空数组', () => {
        expect(queueItemsOrEmpty(undefined)).toEqual([]);
        expect(queueItemsOrEmpty([{ taskId: 1, modelId: 'm' }])).toEqual([
            { taskId: 1, modelId: 'm' },
        ]);
    });
});

describe('static asset', () => {
    test('根路径走 index.html', () => {
        expect(resolveStaticAsset('/', { '/index.html': '/tmp/index.html' })).toBe(
            '/tmp/index.html',
        );
    });

    test('精确文件命中', () => {
        expect(resolveStaticAsset('/app.js', { '/app.js': '/tmp/app.js' })).toBe('/tmp/app.js');
    });

    test('未构建的文件请求返回空', () => {
        expect(resolveStaticAsset('/app.js', {})).toBeUndefined();
    });

    test('SPA 回退 index.html', () => {
        expect(resolveStaticAsset('/tasks', { '/index.html': '/tmp/index.html' })).toBe(
            '/tmp/index.html',
        );
    });

    test('内容类型', () => {
        expect(contentTypeFor('/a.js')).toBe('application/javascript; charset=utf-8');
        expect(contentTypeFor('/a.bin')).toBe('application/octet-stream');
    });
});

describe('ws send', () => {
    test('发送成功', () => {
        const sent: string[] = [];
        expect(trySendWs({ send: (text) => sent.push(text) }, 'hi')).toBe(true);
        expect(sent).toEqual(['hi']);
    });

    test('发送失败返回 false', () => {
        expect(
            trySendWs(
                {
                    send: () => {
                        throw new Error('closed');
                    },
                },
                'hi',
            ),
        ).toBe(false);
    });

    test('广播时删除发送失败的客户端', () => {
        const good = { send: () => {} };
        const bad = {
            send: () => {
                throw new Error('closed');
            },
        };
        const clients = new Set([good, bad]);
        sendJsonToClients(clients, { ok: true });
        expect(clients.has(good)).toBe(true);
        expect(clients.has(bad)).toBe(false);
    });
});

describe('runtime env', () => {
    test('注入存在的路径', () => {
        const env: Record<string, string | undefined> = {};
        applyRuntimeAssetEnv({ ffmpegPath: '/ff', scrcpyServerPath: '/sc' }, env);
        expect(env.MIDSCENE_FFMPEG_PATH).toBe('/ff');
        expect(env.MIDSCENE_SCRCPY_SERVER_PATH).toBe('/sc');
    });

    test('路径为空时不写', () => {
        const env: Record<string, string | undefined> = {};
        applyRuntimeAssetEnv({ ffmpegPath: null, scrcpyServerPath: null }, env);
        expect(env.MIDSCENE_FFMPEG_PATH).toBeUndefined();
    });
});

describe('port cleanup', () => {
    test('过滤自身 PID', () => {
        expect(
            findPortPidsWith({
                platform: 'linux',
                selfPid: 1,
                stdout: '1\n2\n',
                port: 80,
            }),
        ).toEqual([2]);
    });

    test('空闲端口直接返回', () => {
        let killed = 0;
        ensurePortFreeWith({
            port: 1,
            pids: [],
            kill: () => {
                killed += 1;
            },
            isFree: () => true,
            wait: () => {},
            maxWaits: 3,
            log: () => {},
            warn: () => {},
        });
        expect(killed).toBe(0);
    });

    test('杀掉占用进程后等到释放', () => {
        const killed: number[] = [];
        let checks = 0;
        ensurePortFreeWith({
            port: 1,
            pids: [9],
            kill: (pid) => killed.push(pid),
            isFree: () => {
                checks += 1;
                return checks > 1;
            },
            wait: () => {},
            maxWaits: 3,
            log: () => {},
            warn: () => {},
        });
        expect(killed).toEqual([9]);
    });

    test('一直占用则警告', () => {
        const warnings: string[] = [];
        ensurePortFreeWith({
            port: 7,
            pids: [3],
            kill: () => {},
            isFree: () => false,
            wait: () => {},
            maxWaits: 2,
            log: () => {},
            warn: (message) => warnings.push(message),
        });
        expect(warnings[0]).toContain('7');
    });
});

describe('queue start', () => {
    test('队列不存在或为空', () => {
        expect(namedQueueUnavailable(null)?.status).toBe(404);
        expect(namedQueueUnavailable({ items: [] })?.status).toBe(400);
        expect(namedQueueUnavailable({ items: [1] })).toBeNull();
    });

    test('计数与错误文案', () => {
        expect(applyQueueItemStart({ started: 0, queued: 0, errors: [] }, true).queued).toBe(1);
        expect(applyQueueItemStart({ started: 0, queued: 0, errors: [] }, false).started).toBe(1);
        expect(queueItemMissingError(3)).toContain('#3');
        expect(queueItemStartError('登录', new ScriptInvalidError(['坏了']))).toContain('校验失败');
        expect(queueItemStartError('登录', new Error('超时'))).toContain('启动失败');
    });

    test('按条目启动并跳过缺失任务', () => {
        const result = startNamedQueueItems({
            items: [
                { taskId: 1, modelId: 'm' },
                { taskId: 2, modelId: 'm' },
                { taskId: 3, modelId: 'm' },
            ],
            getTask: (taskId) =>
                taskId === 2 ? null : { id: taskId, name: `t${taskId}`, yaml: 'x' },
            start: (task) => {
                if (task.id === 3) {
                    throw new Error('fail');
                }
                return { queued: task.id === 1 };
            },
        });
        expect(result).toEqual({
            started: 0,
            queued: 1,
            errors: [queueItemMissingError(2), queueItemStartError('t3', new Error('fail'))],
        });
    });
});
