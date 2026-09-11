import { describe, expect, test } from 'bun:test';
import { extractLastAiResult } from '../src/server/ai-result';

const dumpJson = JSON.stringify({
    groupName: '测试',
    executions: [
        {
            name: 'aiTap',
            tasks: [
                { type: 'Planning', thought: '需要先找到登录按钮' },
                {
                    type: 'Insight',
                    thought: '找到了登录按钮',
                    output: {
                        element: {
                            rect: { left: 10, top: 20, width: 100, height: 40 },
                            center: [60, 40],
                        },
                    },
                },
            ],
        },
    ],
});

describe('extractLastAiResult', () => {
    test('提取最后一个执行里的思考过程和定位元素', () => {
        const result = extractLastAiResult(dumpJson);
        expect(result).toMatchObject({
            action: 'aiTap',
            thought: '找到了登录按钮',
            element: { center: [60, 40] },
        });
    });

    test('提取断言结果', () => {
        const dump = JSON.stringify({
            executions: [
                {
                    name: 'aiAssert',
                    tasks: [
                        { type: 'Insight', output: { pass: true, thought: '页面确实有欢迎语' } },
                    ],
                },
            ],
        });
        expect(extractLastAiResult(dump)).toMatchObject({
            assertPass: true,
            thought: '页面确实有欢迎语',
        });
    });

    test('提取 aiQuery 的数据', () => {
        const dump = JSON.stringify({
            executions: [
                {
                    name: 'aiQuery',
                    tasks: [{ type: 'Insight', output: { data: { title: 'Example' } } }],
                },
            ],
        });
        expect(extractLastAiResult(dump)).toMatchObject({ data: { title: 'Example' } });
    });

    test('多个执行时只取最后一个', () => {
        const dump = JSON.stringify({
            executions: [
                { name: 'aiTap', tasks: [{ type: 'Planning', thought: '第一次' }] },
                { name: 'aiAssert', tasks: [{ type: 'Planning', thought: '第二次' }] },
            ],
        });
        expect(extractLastAiResult(dump)).toMatchObject({ action: 'aiAssert' });
    });

    test('dump 为空或损坏时返回 null', () => {
        expect(extractLastAiResult('not json')).toBeNull();
        expect(extractLastAiResult('{}')).toBeNull();
        expect(extractLastAiResult('{"executions":[]}')).toBeNull();
    });
});
