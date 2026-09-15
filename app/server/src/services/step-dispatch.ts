import type { FlowStep } from '@server/lib/yamlflow';

const AI_WAIT_FOR_DEFAULT_TIMEOUT_MS = 15_000;
const MOCK_STEP_DELAY_MS = 600;

export type LaunchAndroidApp = (target: string) => Promise<void>;

export type StepAgent = {
    launch: (target: string) => Promise<unknown>;
    ai: (prompt: string) => Promise<unknown>;
    aiTap: (locate: string) => Promise<unknown>;
    aiHover: (locate: string) => Promise<unknown>;
    aiRightClick: (locate: string) => Promise<unknown>;
    aiInput: (value: string, locate: string) => Promise<unknown>;
    aiAssert: (
        prompt: string,
    ) => Promise<{ pass?: boolean; message?: string; thought?: string } | undefined>;
    aiWaitFor: (prompt: string, options: { timeoutMs: number }) => Promise<unknown>;
    aiQuery: (prompt: string) => Promise<unknown>;
    aiKeyboardPress: (key: string) => Promise<unknown>;
    aiScroll: (
        options: { direction: string; scrollType: string; distance?: number },
        locate?: string,
    ) => Promise<unknown>;
} | null;

function stepText(step: FlowStep) {
    if (typeof step.params === 'string') {
        return step.params;
    }
    return '';
}

export function isFailedAssert(result: { pass?: boolean } | undefined) {
    if (!result) {
        return false;
    }
    return result.pass === false;
}

export async function launchWithAgent(input: {
    agent: NonNullable<StepAgent>;
    step: FlowStep;
    launchAndroidApp: LaunchAndroidApp | null;
}) {
    if (input.launchAndroidApp) {
        await input.launchAndroidApp(String(input.step.params));
    } else {
        await input.agent.launch(String(input.step.params));
    }
    return { launched: input.step.params };
}

export async function dispatchLaunch(input: {
    agent: StepAgent;
    step: FlowStep;
    launchAndroidApp: LaunchAndroidApp | null;
}) {
    if (!input.agent) {
        throw new Error('打开 App 步骤只能由 Android 任务执行');
    }
    return launchWithAgent({
        agent: input.agent,
        step: input.step,
        launchAndroidApp: input.launchAndroidApp,
    });
}

export async function dispatchMockAction(input: {
    step: FlowStep;
    sleep: (ms: number) => Promise<unknown>;
}) {
    if (input.step.action === 'sleep') {
        await input.sleep(Number(input.step.params));
        return { slept: input.step.params };
    }
    await input.sleep(MOCK_STEP_DELAY_MS);
    return { thought: `MOCK：${input.step.action} 执行成功`, action: input.step.action };
}

export async function dispatchMockStep(input: {
    step: FlowStep;
    stepIndex: number;
    mockFailAt: number;
    sleep: (ms: number) => Promise<unknown>;
}) {
    if (input.stepIndex === input.mockFailAt) {
        throw new Error('MOCK 模拟的步骤失败');
    }
    return dispatchMockAction(input);
}

async function dispatchAi(agent: NonNullable<StepAgent>, step: FlowStep) {
    return { output: await agent.ai(stepText(step)) };
}

async function dispatchAiTap(agent: NonNullable<StepAgent>, step: FlowStep) {
    await agent.aiTap(stepText(step));
    return null;
}

async function dispatchAiHover(agent: NonNullable<StepAgent>, step: FlowStep) {
    await agent.aiHover(stepText(step));
    return null;
}

async function dispatchAiRightClick(agent: NonNullable<StepAgent>, step: FlowStep) {
    await agent.aiRightClick(stepText(step));
    return null;
}

async function dispatchAiInput(agent: NonNullable<StepAgent>, step: FlowStep) {
    const params = step.params as { locate: string; value: string | number };
    await agent.aiInput(String(params.value), params.locate);
    return null;
}

export function thoughtOrPrompt(result: { thought?: string } | undefined, prompt: string) {
    if (result?.thought) {
        return result.thought;
    }
    return prompt;
}

export function assertFailMessage(
    result: { message?: string; thought?: string } | undefined,
    prompt: string,
) {
    if (result?.message) {
        return result.message;
    }
    return thoughtOrPrompt(result, prompt);
}

async function dispatchAiAssert(agent: NonNullable<StepAgent>, step: FlowStep) {
    const prompt = stepText(step);
    const result = await agent.aiAssert(prompt);
    if (isFailedAssert(result)) {
        throw new Error(`断言不通过：${assertFailMessage(result, prompt)}`);
    }
    return result;
}

async function dispatchAiWaitFor(agent: NonNullable<StepAgent>, step: FlowStep) {
    await agent.aiWaitFor(stepText(step), {
        timeoutMs: step.aux?.timeout ?? AI_WAIT_FOR_DEFAULT_TIMEOUT_MS,
    });
    return null;
}

async function dispatchAiQuery(agent: NonNullable<StepAgent>, step: FlowStep) {
    return { data: await agent.aiQuery(stepText(step)) };
}

export function keyboardPressKey(step: FlowStep) {
    if (typeof step.params === 'object' && step.params !== null) {
        return String((step.params as { key: string }).key);
    }
    return stepText(step);
}

async function dispatchAiKeyboardPress(agent: NonNullable<StepAgent>, step: FlowStep) {
    await agent.aiKeyboardPress(keyboardPressKey(step));
    return null;
}

async function dispatchAiScroll(agent: NonNullable<StepAgent>, step: FlowStep) {
    const params = step.params as {
        direction: 'up' | 'down' | 'left' | 'right';
        scrollType?: string;
        distance?: number;
        locate?: string;
    };
    await agent.aiScroll(
        {
            direction: params.direction,
            scrollType: params.scrollType ?? 'once',
            distance: params.distance,
        },
        params.locate,
    );
    return null;
}

async function dispatchSleep(step: FlowStep, sleep: (ms: number) => Promise<unknown>) {
    await sleep(Number(step.params));
    return { slept: step.params };
}

const LIVE_HANDLERS: Record<
    string,
    (
        agent: NonNullable<StepAgent>,
        step: FlowStep,
        sleep: (ms: number) => Promise<unknown>,
    ) => Promise<unknown>
> = {
    ai: dispatchAi,
    aiTap: dispatchAiTap,
    aiHover: dispatchAiHover,
    aiRightClick: dispatchAiRightClick,
    aiInput: dispatchAiInput,
    aiAssert: dispatchAiAssert,
    aiWaitFor: dispatchAiWaitFor,
    aiQuery: dispatchAiQuery,
    aiKeyboardPress: dispatchAiKeyboardPress,
    aiScroll: dispatchAiScroll,
};

export async function dispatchHandlerStep(input: {
    agent: StepAgent;
    step: FlowStep;
    sleep: (ms: number) => Promise<unknown>;
}) {
    const handler = LIVE_HANDLERS[input.step.action];
    if (!handler) {
        throw new Error(`未知动作：${input.step.action}`);
    }
    return dispatchKnownHandler(input.agent, input.step, handler, input.sleep);
}

function dispatchKnownHandler(
    agent: StepAgent,
    step: FlowStep,
    handler: (
        agent: NonNullable<StepAgent>,
        step: FlowStep,
        sleep: (ms: number) => Promise<unknown>,
    ) => Promise<unknown>,
    sleep: (ms: number) => Promise<unknown>,
) {
    if (!agent) {
        throw new Error(`动作 ${step.action} 需要 Agent`);
    }
    return handler(agent, step, sleep);
}

export async function dispatchLiveStep(input: {
    agent: StepAgent;
    step: FlowStep;
    sleep: (ms: number) => Promise<unknown>;
}) {
    if (input.step.action === 'sleep') {
        return dispatchSleep(input.step, input.sleep);
    }
    return dispatchHandlerStep(input);
}

export function mockFailAtFromEnv(value: string | undefined) {
    if (value === undefined) {
        return -1;
    }
    return Number(value);
}

export function optionalLauncher(launchAndroidApp: LaunchAndroidApp | null | undefined) {
    if (launchAndroidApp) {
        return launchAndroidApp;
    }
    return null;
}

export async function dispatchMockOrLive(input: {
    agent: StepAgent;
    step: FlowStep;
    stepIndex: number;
    mockAi: boolean;
    mockFailAt: number;
    sleep: (ms: number) => Promise<unknown>;
}) {
    if (input.mockAi) {
        return dispatchMockStep({
            step: input.step,
            stepIndex: input.stepIndex,
            mockFailAt: input.mockFailAt,
            sleep: input.sleep,
        });
    }
    return dispatchLiveStep({
        agent: input.agent,
        step: input.step,
        sleep: input.sleep,
    });
}

export async function dispatchStepWith(input: {
    agent: StepAgent;
    step: FlowStep;
    stepIndex: number;
    launchAndroidApp: LaunchAndroidApp | null;
    mockAi: boolean;
    mockFailAt: number;
    sleep: (ms: number) => Promise<unknown>;
}) {
    if (input.step.action === 'launch') {
        return dispatchLaunch({
            agent: input.agent,
            step: input.step,
            launchAndroidApp: input.launchAndroidApp,
        });
    }
    return dispatchMockOrLive(input);
}
