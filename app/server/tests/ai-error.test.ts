import { describe, expect, test } from 'bun:test';
import {
    API_KEY_UNAUTHORIZED_MESSAGE,
    API_KEY_UNCONFIGURED_MESSAGE,
    formatErrorMessage,
    formatRunHistory,
} from '@server/lib/ai-error';

describe('formatErrorMessage', () => {
    test.each([
        ['自由指令超时', 'AI model request timed out after 30000ms'],
        [
            '英文定位错误',
            "failed to locate element: I cannot find a red 'Log out' button in the screenshot.",
        ],
        ['输入框定位失败', 'cannot find input'],
        ['断言失败', 'assert failed: expected welcome text, found login form'],
        ['等待条件超时', 'aiWaitFor timeout after 10000ms'],
        ['网络连接失败', 'Connection error: ECONNREFUSED'],
        ['模型响应格式错误', 'Unexpected token in JSON at position 42'],
        ['中英混合错误', '执行失败：The browser has disconnected unexpectedly'],
        ['中文模型错误', '模型未找到登录按钮，请确认页面是否加载完成'],
        ['非模型错误', 'sleep failed'],
    ])('test_%s_保留真实错误', (_scenario, message) => {
        const error = new Error(message);

        const result = formatErrorMessage(error);

        expect(result).toBe(message);
    });

    test('test_字符串异常_保留错误文本', () => {
        const result = formatErrorMessage('Request timed out');

        expect(result).toBe('Request timed out');
    });

    test('test_未配置密钥_保留配置错误提示', () => {
        const error = new Error(
            "failed to call AI model service: Header '14' has invalid value: 'Bearer 在这里填你的 API Key'",
        );

        const result = formatErrorMessage(error);

        expect(result).toBe(API_KEY_UNCONFIGURED_MESSAGE);
    });

    test('test_密钥未授权_保留认证错误提示', () => {
        const error = new Error('failed to call AI model service: 401 Unauthorized');

        const result = formatErrorMessage(error);

        expect(result).toBe(API_KEY_UNAUTHORIZED_MESSAGE);
    });
});

describe('formatRunHistory', () => {
    test('test_读取历史记录_保留真实错误及独立任务内容', () => {
        const englishError =
            "failed to locate element: I cannot find a red 'Log out' button in the screenshot.";

        const result = formatRunHistory(
            {
                id: 57,
                taskId: 3,
                taskName: 'comeonlines 测试流程',
                model: 'minimax-m3:cloud',
                status: 'failed',
                error: `第 6 步（退出登陆）失败：${englishError}`,
                startedAt: '2026-07-22T09:55:44.288Z',
                finishedAt: '2026-07-22T09:56:54.746Z',
                durationMs: 70458,
                tokenInput: 17195,
                tokenOutput: 1424,
            },
            [
                {
                    id: 215,
                    runId: 57,
                    stepIndex: 5,
                    stepName: '退出登陆',
                    action: 'aiTap',
                    url: 'https://www.comeonlines.com/en/account',
                    prompt: '红色的 Log out 按钮',
                    aiResult: null,
                    shotBefore: '57/5-before.jpg',
                    shotAfter: '57/5-after.jpg',
                    durationMs: 13338,
                    tokenInput: 2619,
                    tokenOutput: 286,
                    status: 'failed',
                    error: englishError,
                    createdAt: '2026-07-22T09:56:54.742Z',
                },
            ],
        );

        expect(result).toMatchObject({
            run: {
                error: `第 6 步（退出登陆）失败：${englishError}`,
            },
            steps: [
                {
                    error: englishError,
                    prompt: '红色的 Log out 按钮',
                },
            ],
        });
    });
});
