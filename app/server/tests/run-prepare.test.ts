import { describe, expect, test } from 'bun:test';
import {
    addTokenUsage,
    executeFailError,
    executeFailStatus,
    parseErrorList,
    parseQueueTaskYaml,
    queueItemCanStart,
    queueTaskId,
    requireChromePath,
    resolvedAiResult,
    runStartErrors,
    scriptFromParse,
    scriptFromParseResult,
    scriptNeedsFamily,
    scriptNeedsModelFamily,
    stepFailError,
    stepLabel,
    stepNeedsModelFamily,
    stepPrompt,
    stringifyAiResult,
    webChromePath,
    webViewportSize,
    WEB_VIEWPORT_DEFAULT,
} from '../src/services/run-prepare';
import type { ParsedScript } from '../src/lib/yamlflow';

const webScript: ParsedScript = {
    target: { type: 'web', url: 'https://a.com' },
    tasks: [{ name: '登录', flow: [{ action: 'aiTap', params: '按钮' }] }],
};

const androidScript: ParsedScript = {
    target: { type: 'android', deviceId: 'dev' },
    tasks: [
        {
            name: '打开',
            flow: [
                { action: 'launch', params: 'app' },
                { action: 'aiTap', params: '按钮' },
            ],
        },
    ],
};

describe('run-prepare', () => {
    test('步骤是否需要 family', () => {
        expect(stepNeedsModelFamily({ targetType: 'web', action: 'ai' })).toBe(true);
        expect(stepNeedsModelFamily({ targetType: 'web', action: 'aiTap' })).toBe(false);
        expect(stepNeedsModelFamily({ targetType: 'android', action: 'launch' })).toBe(false);
        expect(stepNeedsModelFamily({ targetType: 'android', action: 'sleep' })).toBe(false);
        expect(stepNeedsModelFamily({ targetType: 'android', action: 'aiTap' })).toBe(true);
    });

    test('脚本是否需要 family', () => {
        expect(scriptNeedsModelFamily(webScript)).toBe(false);
        expect(
            scriptNeedsModelFamily({
                ...webScript,
                tasks: [{ name: 'a', flow: [{ action: 'ai', params: '做' }] }],
            }),
        ).toBe(true);
        expect(scriptNeedsModelFamily(androidScript)).toBe(true);
        expect(scriptNeedsFamily(null)).toBe(false);
        expect(scriptNeedsFamily(webScript)).toBe(false);
    });

    test('启动错误', () => {
        expect(
            runStartErrors({
                parseOk: false,
                parseErrors: ['坏 yaml'],
                model: undefined,
                modelId: 'm',
                needsFamily: false,
                chromeRequired: false,
                chromePath: null,
            }),
        ).toEqual(['坏 yaml']);
        expect(
            runStartErrors({
                parseOk: true,
                parseErrors: [],
                model: undefined,
                modelId: 'm1',
                needsFamily: false,
                chromeRequired: false,
                chromePath: null,
            }),
        ).toEqual(['模型 m1 不存在']);
        expect(
            runStartErrors({
                parseOk: true,
                parseErrors: [],
                model: { id: 'm', name: 'X', model: 'x', family: undefined } as never,
                modelId: 'm',
                needsFamily: true,
                chromeRequired: false,
                chromePath: null,
            })[0],
        ).toContain('family');
        expect(
            runStartErrors({
                parseOk: true,
                parseErrors: [],
                model: { id: 'm', name: 'X', model: 'x', family: 'kimi' } as never,
                modelId: 'm',
                needsFamily: false,
                chromeRequired: true,
                chromePath: null,
            }),
        ).toEqual(['未检测到系统 Chrome，请先安装 Google Chrome 浏览器']);
        expect(
            runStartErrors({
                parseOk: true,
                parseErrors: [],
                model: { id: 'm', name: 'X', model: 'x', family: 'kimi' } as never,
                modelId: 'm',
                needsFamily: false,
                chromeRequired: true,
                chromePath: '/chrome',
            }),
        ).toEqual([]);
    });

    test('队列条目能否启动', () => {
        expect(
            queueItemCanStart({
                hasTask: false,
                hasModel: true,
                parseOk: true,
                chromeRequired: false,
                chromePath: null,
            }),
        ).toBe(false);
        expect(
            queueItemCanStart({
                hasTask: true,
                hasModel: false,
                parseOk: true,
                chromeRequired: false,
                chromePath: null,
            }),
        ).toBe(false);
        expect(
            queueItemCanStart({
                hasTask: true,
                hasModel: true,
                parseOk: false,
                chromeRequired: false,
                chromePath: null,
            }),
        ).toBe(false);
        expect(
            queueItemCanStart({
                hasTask: true,
                hasModel: true,
                parseOk: true,
                chromeRequired: true,
                chromePath: null,
            }),
        ).toBe(false);
        expect(
            queueItemCanStart({
                hasTask: true,
                hasModel: true,
                parseOk: true,
                chromeRequired: true,
                chromePath: '/c',
            }),
        ).toBe(true);
    });

    test('步骤文案', () => {
        expect(stepLabel('登录', { action: 'aiTap', params: 'x' })).toBe('登录');
        expect(stepLabel('登录', { action: 'aiTap', params: 'x', aux: { name: '点' } })).toBe('点');
        expect(stepPrompt({ action: 'aiTap', params: '按钮' })).toBe('按钮');
        expect(stepPrompt({ action: 'aiInput', params: { locate: '框', value: '1' } })).toBe(
            '在「框」输入「1」',
        );
        expect(stepPrompt({ action: 'aiScroll', params: { direction: 'down' } })).toContain(
            'direction',
        );
        expect(stepPrompt({ action: 'aiInput', params: 1 })).toBe('1');
    });

    test('token 与失败状态', () => {
        expect(
            addTokenUsage({ input: 1, output: 2 }, { prompt_tokens: 3, completion_tokens: 4 }),
        ).toEqual({
            input: 4,
            output: 6,
        });
        expect(addTokenUsage({ input: 0, output: 0 }, {})).toEqual({ input: 0, output: 0 });
        expect(executeFailStatus(true)).toBe('stopped');
        expect(executeFailStatus(false)).toBe('failed');
        expect(
            executeFailError({ stopRequested: true, error: new Error('x'), format: () => 'f' }),
        ).toBe('手动停止');
        expect(
            executeFailError({ stopRequested: false, error: new Error('x'), format: () => 'f' }),
        ).toBe('f');
        expect(stepFailError({ stopRequested: true, index: 0, label: 'a', message: 'e' })).toBe(
            '手动停止',
        );
        expect(
            stepFailError({ stopRequested: false, index: 0, label: '点', message: 'e' }),
        ).toContain('第 1 步');
    });

    test('解析结果与 Chrome 路径', () => {
        expect(scriptFromParse({ ok: false, errors: ['a'] })).toBeNull();
        expect(scriptFromParse({ ok: true, script: webScript })).toBe(webScript);
        expect(scriptFromParseResult(null)).toBeNull();
        expect(parseErrorList({ ok: true, script: webScript })).toEqual([]);
        expect(parseErrorList({ ok: false, errors: ['a'] })).toEqual(['a']);
        expect(parseQueueTaskYaml(null, {}, () => ({ ok: false, errors: [] }))).toBeNull();
        expect(
            parseQueueTaskYaml({ yaml: 'x' }, {}, () => ({ ok: true, script: webScript })),
        ).toEqual({ ok: true, script: webScript });
        expect(queueTaskId(null)).toBe(0);
        expect(queueTaskId(8)).toBe(8);
        expect(webChromePath({ parseOk: false, targetType: 'web', detect: () => '/c' })).toBeNull();
        expect(
            webChromePath({ parseOk: true, targetType: 'android', detect: () => '/c' }),
        ).toBeNull();
        expect(webChromePath({ parseOk: true, targetType: 'web', detect: () => '/c' })).toBe('/c');
        expect(requireChromePath('/c')).toBe('/c');
        expect(() => requireChromePath(null)).toThrow('Chrome');
        expect(stringifyAiResult(null)).toBeNull();
        expect(stringifyAiResult({ a: 1 })).toBe('{"a":1}');
        expect(resolvedAiResult({ x: 1 }, null)).toEqual({ x: 1 });
        expect(resolvedAiResult(null, null)).toBeNull();
        expect(webViewportSize({})).toEqual(WEB_VIEWPORT_DEFAULT);
        expect(webViewportSize({ viewportWidth: 1, viewportHeight: 2 })).toEqual({
            width: 1,
            height: 2,
        });
    });
});
