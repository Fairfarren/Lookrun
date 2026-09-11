import { describe, expect, test } from 'bun:test';
import { formatRunHistory, formatStepError } from '../src/lib/ai-error';

describe('formatStepError', () => {
    test('英文模型定位错误转换为中文失败原因', () => {
        const error = new Error(
            "failed to locate element: I cannot find a red 'Log out' button in the screenshot.",
        );

        const result = formatStepError(error, {
            action: 'aiTap',
            params: '红色的 Log out 按钮',
        });

        expect(result).toBe('模型未能在当前页面中找到目标元素：红色的 Log out 按钮');
    });

    test('已有中文模型错误保持原文', () => {
        const error = new Error('模型未找到登录按钮，请确认页面是否加载完成');

        const result = formatStepError(error, {
            action: 'aiTap',
            params: '登录按钮',
        });

        expect(result).toBe('模型未找到登录按钮，请确认页面是否加载完成');
    });

    test('aiInput 用 locate 作为中文目标', () => {
        const result = formatStepError(new Error('cannot find input'), {
            action: 'aiInput',
            params: { locate: '用户名输入框', value: 'alice' },
        });
        expect(result).toBe('模型未能在当前页面中找到目标元素：用户名输入框');
    });

    test('aiAssert 英文错误转成中文断言失败', () => {
        const result = formatStepError(new Error('assert failed'), {
            action: 'aiAssert',
            params: '页面出现欢迎语',
        });
        expect(result).toBe('模型执行页面断言失败：页面出现欢迎语');
    });

    test('非 AI 步骤错误保持原文', () => {
        const error = new Error('sleep failed');

        const result = formatStepError(error, {
            action: 'sleep',
            params: 500,
        });

        expect(result).toBe('sleep failed');
    });

    test('读取旧运行记录时同步转换步骤和运行错误', () => {
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
                error: '第 6 步（退出登陆）失败：模型未能在当前页面中找到目标元素：红色的 Log out 按钮',
            },
            steps: [
                {
                    error: '模型未能在当前页面中找到目标元素：红色的 Log out 按钮',
                },
            ],
        });
    });
});
