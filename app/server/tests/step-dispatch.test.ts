import { describe, expect, test } from 'bun:test';
import {
    assertFailMessage,
    dispatchLaunch,
    dispatchLiveStep,
    dispatchMockStep,
    dispatchStepWith,
    isFailedAssert,
    keyboardPressKey,
    mockFailAtFromEnv,
    optionalLauncher,
    type StepAgent,
} from '../src/services/step-dispatch';

function agentStub(overrides: Partial<NonNullable<StepAgent>> = {}): NonNullable<StepAgent> {
    return {
        launch: async () => {},
        ai: async () => 'out',
        aiTap: async () => {},
        aiHover: async () => {},
        aiRightClick: async () => {},
        aiInput: async () => {},
        aiAssert: async () => ({ pass: true }),
        aiWaitFor: async () => {},
        aiQuery: async () => ({ ok: true }),
        aiKeyboardPress: async () => {},
        aiScroll: async () => {},
        ...overrides,
    };
}

describe('step-dispatch', () => {
    test('断言失败判断', () => {
        expect(isFailedAssert(undefined)).toBe(false);
        expect(isFailedAssert({ pass: true })).toBe(false);
        expect(isFailedAssert({ pass: false })).toBe(true);
        expect(assertFailMessage({ message: 'm' }, 'p')).toBe('m');
        expect(assertFailMessage({ thought: 't' }, 'p')).toBe('t');
        expect(assertFailMessage({}, 'p')).toBe('p');
    });

    test('环境与 launcher', () => {
        expect(mockFailAtFromEnv(undefined)).toBe(-1);
        expect(mockFailAtFromEnv('2')).toBe(2);
        expect(optionalLauncher(undefined)).toBeNull();
        expect(optionalLauncher(async () => {})).toBeFunction();
    });

    test('打开 App', async () => {
        await expect(
            dispatchLaunch({
                agent: null,
                step: { action: 'launch', params: 'a' },
                launchAndroidApp: null,
            }),
        ).rejects.toThrow('Android');
        let launched = '';
        await dispatchLaunch({
            agent: agentStub(),
            step: { action: 'launch', params: 'pkg' },
            launchAndroidApp: async (target) => {
                launched = target;
            },
        });
        expect(launched).toBe('pkg');
        let direct = '';
        await dispatchLaunch({
            agent: agentStub({
                launch: async (target) => {
                    direct = target;
                },
            }),
            step: { action: 'launch', params: 'pkg2' },
            launchAndroidApp: null,
        });
        expect(direct).toBe('pkg2');
    });

    test('MOCK 步骤', async () => {
        const slept: number[] = [];
        await expect(
            dispatchMockStep({
                step: { action: 'aiTap', params: 'x' },
                stepIndex: 1,
                mockFailAt: 1,
                sleep: async () => {},
            }),
        ).rejects.toThrow('MOCK');
        expect(
            await dispatchMockStep({
                step: { action: 'sleep', params: 10 },
                stepIndex: 0,
                mockFailAt: -1,
                sleep: async (ms) => {
                    slept.push(ms);
                },
            }),
        ).toEqual({ slept: 10 });
        expect(
            await dispatchMockStep({
                step: { action: 'aiTap', params: 'x' },
                stepIndex: 0,
                mockFailAt: -1,
                sleep: async () => {},
            }),
        ).toEqual({ thought: 'MOCK：aiTap 执行成功', action: 'aiTap' });
        expect(slept).toEqual([10]);
    });

    test('真实步骤分发', async () => {
        const calls: string[] = [];
        const agent = agentStub({
            aiTap: async (locate) => {
                calls.push(locate);
            },
            aiAssert: async () => ({ pass: false, message: 'no' }),
        });
        await dispatchLiveStep({
            agent,
            step: { action: 'aiTap', params: '按钮' },
            sleep: async () => {},
        });
        expect(calls).toEqual(['按钮']);
        expect(
            await dispatchLiveStep({
                agent,
                step: { action: 'sleep', params: 1 },
                sleep: async () => {},
            }),
        ).toEqual({ slept: 1 });
        await expect(
            dispatchLiveStep({
                agent,
                step: { action: 'unknown', params: 'x' },
                sleep: async () => {},
            }),
        ).rejects.toThrow('未知动作');
        await expect(
            dispatchLiveStep({
                agent: null,
                step: { action: 'aiTap', params: 'x' },
                sleep: async () => {},
            }),
        ).rejects.toThrow('Agent');
        await expect(
            dispatchLiveStep({
                agent,
                step: { action: 'aiAssert', params: '看见' },
                sleep: async () => {},
            }),
        ).rejects.toThrow('断言不通过');
        expect(keyboardPressKey({ action: 'aiKeyboardPress', params: { key: 'Enter' } })).toBe(
            'Enter',
        );
        expect(keyboardPressKey({ action: 'aiKeyboardPress', params: 'Tab' })).toBe('Tab');
    });

    test('dispatchStepWith 分发 launch 与 mock', async () => {
        const result = await dispatchStepWith({
            agent: agentStub(),
            step: { action: 'launch', params: 'app' },
            stepIndex: 0,
            launchAndroidApp: null,
            mockAi: false,
            mockFailAt: -1,
            sleep: async () => {},
        });
        expect(result).toEqual({ launched: 'app' });
        expect(
            await dispatchStepWith({
                agent: agentStub(),
                step: { action: 'aiTap', params: 'x' },
                stepIndex: 0,
                launchAndroidApp: null,
                mockAi: true,
                mockFailAt: -1,
                sleep: async () => {},
            }),
        ).toEqual({ thought: 'MOCK：aiTap 执行成功', action: 'aiTap' });
    });
});

test.each(['aiHover', 'aiRightClick', 'aiKeyboardPress'] as const)(
    '实时动作%s将文本交给设备并返回空结果',
    async (action) => {
        let effect = '';
        const agent = agentStub({
            [action]: async (value: string) => {
                effect = value;
            },
        });

        const result = await dispatchLiveStep({
            agent,
            step: { action, params: '目标' },
            sleep: async () => {},
        });

        expect({ effect, result }).toEqual({ effect: '目标', result: null });
    },
);

test('输入动作将数字转换为文本并保留定位目标', async () => {
    let input: unknown;
    const agent = agentStub({
        aiInput: async (value, locate) => {
            input = { value, locate };
        },
    });

    await dispatchLiveStep({
        agent,
        step: { action: 'aiInput', params: { value: 42, locate: '输入框' } },
        sleep: async () => {},
    });

    expect(input).toEqual({ value: '42', locate: '输入框' });
});

test('等待动作使用步骤指定的超时', async () => {
    let input: unknown;
    const agent = agentStub({
        aiWaitFor: async (prompt, options) => {
            input = { prompt, ...options };
        },
    });

    await dispatchLiveStep({
        agent,
        step: { action: 'aiWaitFor', params: '加载完成', aux: { timeout: 500 } },
        sleep: async () => {},
    });

    expect(input).toEqual({ prompt: '加载完成', timeoutMs: 500 });
});

test('查询动作返回可保存的数据', async () => {
    const agent = agentStub({ aiQuery: async () => ({ count: 3 }) });

    const result = await dispatchLiveStep({
        agent,
        step: { action: 'aiQuery', params: '统计条目' },
        sleep: async () => {},
    });

    expect(result).toEqual({ data: { count: 3 } });
});

test('滚动动作默认只滚动一次并保留目标距离', async () => {
    let input: unknown;
    const agent = agentStub({
        aiScroll: async (options, locate) => {
            input = { ...options, locate };
        },
    });

    await dispatchLiveStep({
        agent,
        step: { action: 'aiScroll', params: { direction: 'down', distance: 300, locate: '列表' } },
        sleep: async () => {},
    });

    expect(input).toEqual({ direction: 'down', scrollType: 'once', distance: 300, locate: '列表' });
});
