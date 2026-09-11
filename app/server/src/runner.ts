import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import type { Database } from 'bun:sqlite';
import type { ModelConfig, RunRecord, RunStepRecord } from '@lookrun/shared';
import { formatErrorMessage, formatStepError } from './ai-error';
import { extractLastAiResult } from './ai-result';
import { startAndroidLivePreview } from './android-preview';
import { detectChrome } from './chrome';
import { REPORT_DIR, RUN_KEEP_COUNT, SCREENSHOT_DIR } from './config';
import {
    finishRun,
    getRun,
    getTask,
    insertRun,
    insertStep,
    listRunSteps,
    listVariables,
} from './db';
import { getModelById, loadModels, toMidsceneModelConfig } from './models';
import { enqueue, listQueue, nextPending, requeueInterrupted, setQueueStatus } from './queue';
import { cleanupOldRuns } from './retention';
import { clickTargetForStep, type ClickTarget, markClickOnScreenshot } from './screenshot-marker';
import { startScreencast } from './screencast';
import { broadcast, hasWsClients } from './ws';
import { activatePageSession } from './page-session';
import { parseScript, type FlowStep, type ParsedScript } from './yamlflow';
import {
    androidAdbPath,
    checkAndroidDevice,
    createDeviceAndroidAppLauncher,
} from './android-service';

// Midscene 自己的 HTML 报告也落到数据目录下，方便需要时翻看
process.env.MIDSCENE_RUN_DIR ??= REPORT_DIR;
// 模型的思考过程、断言结论、定位失败原因统一用中文输出（注入到 Midscene 的提示词里）
process.env.MIDSCENE_PREFERRED_LANGUAGE ??= 'Chinese';

const DEFAULT_VIEWPORT = { width: 390, height: 844 };
// 手机视口参数：让被测站点按移动端布局渲染，截图比例接近真机
const MOBILE_SCALE_FACTOR = 2;
const PAGE_LOAD_TIMEOUT_MS = 30_000;
const AI_WAIT_FOR_DEFAULT_TIMEOUT_MS = 15_000;
const SCREENSHOT_QUALITY = 70;
// MOCK_AI=1 时不调用真实模型，用于无模型环境下验证整条链路
const MOCK_AI = process.env.MOCK_AI === '1';
// MOCK_FAIL_AT=N 时让第 N 步（从 0 开始）失败，用于验证失败即停
const MOCK_FAIL_AT = process.env.MOCK_FAIL_AT === undefined ? -1 : Number(process.env.MOCK_FAIL_AT);

export class ScriptInvalidError extends Error {
    constructor(public errors: string[]) {
        super(errors.join('；'));
    }
}

interface RunningState {
    runId: number;
    taskName: string;
    model: string;
    startedAt: string;
    currentStepIndex: number;
    totalSteps: number;
}

interface FlatStep {
    taskName: string;
    taskUrl?: string;
    step: FlowStep;
}

type AgentInstance = InstanceType<typeof PuppeteerAgent> | AndroidAgent;
type AgentPage = ConstructorParameters<typeof PuppeteerAgent>[0];
type CaptureScreenshot = () => Promise<string>;
type LaunchAndroidApp = (target: string) => Promise<void>;

export class Runner {
    private state: RunningState | null = null;
    private stopRequested = false;
    private browser: Browser | null = null;
    private activeCleanup: (() => Promise<void>) | null = null;

    constructor(private db: Database) {}

    current() {
        return this.state;
    }

    // 启动一次运行：先校验脚本与模型（失败立即报错）；
    // 空闲时立即执行，忙时自动加入队列排队，前一个跑完自动接下一个
    start(input: { taskId: number | null; taskName: string; yaml: string; modelId: string }) {
        const parseResult = parseScript(input.yaml, listVariables(this.db));
        if (!parseResult.ok) {
            throw new ScriptInvalidError(parseResult.errors);
        }
        const model = getModelById(loadModels(), input.modelId);
        if (!model) {
            throw new ScriptInvalidError([`模型 ${input.modelId} 不存在`]);
        }
        // 「自由指令」需要模型带 family（Midscene 用它解析规划坐标），没有 family 的模型必然在第 1 步失败，提前拦截
        const requiresModelFamily = parseResult.script.tasks.some((task) =>
            task.flow.some((step) =>
                parseResult.script.target.type === 'android'
                    ? step.action !== 'launch' && step.action !== 'sleep'
                    : step.action === 'ai',
            ),
        );
        if (requiresModelFamily && !model.family) {
            throw new ScriptInvalidError([
                `任务包含「自由指令」步骤，需要模型配置 family；模型「${model.name}」没有 family，请改用 kimi，或把该步骤改成具体动作（点击/输入/断言等）`,
            ]);
        }
        const chromePath = parseResult.script.target.type === 'web' ? detectChrome().path : null;
        if (parseResult.script.target.type === 'web' && !chromePath) {
            throw new ScriptInvalidError(['未检测到系统 Chrome，请先安装 Google Chrome 浏览器']);
        }

        // 忙时自动入队排队
        if (this.state) {
            const queueItem = enqueue(this.db, {
                taskId: input.taskId ?? 0,
                taskName: input.taskName,
                modelId: model.id,
                model: model.model,
            });
            broadcast({ type: 'queue', items: listQueue(this.db) });
            return { queued: true as const, queueItem };
        }

        const runId = this.runNow({
            taskId: input.taskId,
            taskName: input.taskName,
            script: parseResult.script,
            model,
            chromePath,
        });
        return { queued: false as const, runId };
    }

    // 队列调度：空闲时取出下一个 pending 条目启动；条目失效（任务被删/模型没了/脚本坏了）则跳过
    private scheduleNext() {
        if (this.state) {
            return;
        }
        const next = nextPending(this.db);
        if (!next) {
            return;
        }
        const task = getTask(this.db, next.taskId);
        const model = getModelById(loadModels(), next.modelId);
        const parseResult = task ? parseScript(task.yaml, listVariables(this.db)) : null;
        const chromePath =
            parseResult?.ok && parseResult.script.target.type === 'web'
                ? detectChrome().path
                : null;
        if (
            !task ||
            !model ||
            !parseResult?.ok ||
            (parseResult.script.target.type === 'web' && !chromePath)
        ) {
            setQueueStatus(this.db, next.id, 'cancelled');
            broadcast({ type: 'queue', items: listQueue(this.db) });
            this.scheduleNext();
            return;
        }
        this.runNow({
            taskId: next.taskId,
            taskName: next.taskName,
            script: parseResult.script,
            model,
            chromePath,
            queueItemId: next.id,
        });
    }

    // 程序启动时恢复调度：上次中断的条目标记回 pending 后接着排
    resumeQueue() {
        requeueInterrupted(this.db);
        this.scheduleNext();
    }

    private runNow(input: {
        taskId: number | null;
        taskName: string;
        script: ParsedScript;
        model: ModelConfig;
        chromePath: string | null;
        queueItemId?: number;
    }) {
        const { id: runId } = insertRun(this.db, {
            taskId: input.taskId,
            taskName: input.taskName,
            model: input.model.model,
        });
        if (input.queueItemId) {
            setQueueStatus(this.db, input.queueItemId, 'running', runId);
        }
        this.state = {
            runId,
            taskName: input.taskName,
            model: input.model.model,
            startedAt: new Date().toISOString(),
            currentStepIndex: -1,
            totalSteps: 0,
        };
        this.stopRequested = false;
        broadcast({ type: 'run', run: getRun(this.db, runId) });
        broadcast({ type: 'queue', items: listQueue(this.db) });

        void this.execute(
            runId,
            input.script,
            toMidsceneModelConfig(input.model),
            input.chromePath,
            input.queueItemId,
        );
        return runId;
    }

    async stop() {
        if (!this.state) {
            return;
        }
        this.stopRequested = true;
        // 关闭浏览器让进行中的 AI 调用立即中断，由执行循环收尾标记 stopped
        await Promise.all([
            this.browser?.close().catch(() => {}),
            this.activeCleanup?.().catch(() => {}),
        ]);
    }

    private async execute(
        runId: number,
        script: ParsedScript,
        modelConfig: Record<string, string>,
        chromePath: string | null,
        queueItemId?: number,
    ) {
        const startedAt = Date.now();
        let stopScreencast: (() => Promise<void>) | null = null;
        let totalInput = 0;
        let totalOutput = 0;

        try {
            let agent: AgentInstance | null;
            let captureScreenshot: CaptureScreenshot;
            let currentLocation: () => Promise<string | null>;
            let launchAndroidApp: LaunchAndroidApp | null = null;
            let activateStepPage: (stepUrl?: string) => Promise<void> = async () => {};
            const onLLMUsage = (usage: Record<string, number | undefined>) => {
                totalInput += usage.prompt_tokens ?? 0;
                totalOutput += usage.completion_tokens ?? 0;
            };

            if (script.target.type === 'web') {
                if (!chromePath) {
                    throw new Error('未检测到系统 Chrome，请先安装 Google Chrome 浏览器');
                }
                this.browser = await puppeteer.launch({
                    executablePath: chromePath,
                    headless: true,
                    args: ['--no-first-run', '--no-default-browser-check', '--mute-audio'],
                });
                const viewport = {
                    width: script.target.viewportWidth ?? DEFAULT_VIEWPORT.width,
                    height: script.target.viewportHeight ?? DEFAULT_VIEWPORT.height,
                    isMobile: true,
                    hasTouch: true,
                    deviceScaleFactor: MOBILE_SCALE_FACTOR,
                };
                type WebSession = {
                    page: Page;
                    agent: AgentInstance | null;
                };
                const sessions = new Map<string, WebSession>();
                // 新地址用新标签打开，不能在当前页 goto，否则 H5 发码页会被导航走
                const openWebPage = async (url: string): Promise<WebSession> => {
                    const page = await this.browser!.newPage();
                    await page.setViewport(viewport);
                    await page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: PAGE_LOAD_TIMEOUT_MS,
                    });
                    return {
                        page,
                        agent: MOCK_AI
                            ? null
                            : new PuppeteerAgent(
                                  page as unknown as AgentPage,
                                  {
                                      modelConfig,
                                      onLLMUsage,
                                  } as ConstructorParameters<typeof PuppeteerAgent>[1],
                              ),
                    };
                };
                const initial = await activatePageSession({
                    requestedUrl: script.target.url,
                    currentKey: null,
                    sessions,
                    open: openWebPage,
                });
                let currentPageKey = initial.key;
                let activePage = initial.session.page;
                agent = initial.session.agent;
                stopScreencast = await startScreencast(activePage);
                activateStepPage = async (stepUrl?: string) => {
                    const next = await activatePageSession({
                        requestedUrl: stepUrl,
                        currentKey: currentPageKey,
                        sessions,
                        open: openWebPage,
                    });
                    if (next.key === currentPageKey) {
                        return;
                    }
                    currentPageKey = next.key;
                    activePage = next.session.page;
                    agent = next.session.agent;
                    await stopScreencast?.().catch(() => {});
                    stopScreencast = await startScreencast(activePage);
                    await activePage.bringToFront().catch(() => {});
                };
                captureScreenshot = async () =>
                    String(
                        await activePage.screenshot({
                            encoding: 'base64',
                            type: 'jpeg',
                            quality: SCREENSHOT_QUALITY,
                        }),
                    );
                currentLocation = async () => activePage.url();
            } else {
                const checkResult = await checkAndroidDevice(script.target.deviceId);
                if (!checkResult.ok) {
                    throw new Error(checkResult.message);
                }
                const device = new AndroidDevice(script.target.deviceId, {
                    androidAdbPath: androidAdbPath(),
                    scrcpyConfig: { enabled: true },
                });
                await device.connect();
                const androidAgent = new AndroidAgent(device, {
                    modelConfig,
                    onLLMUsage,
                });
                agent = androidAgent;
                launchAndroidApp = createDeviceAndroidAppLauncher({
                    deviceId: script.target.deviceId,
                    directLaunch: (target) => androidAgent.launch(target),
                });
                let stopLivePreview: (() => Promise<void>) | null = null;
                try {
                    const frameSource = await device.openFrameSource?.();
                    if (frameSource) {
                        stopLivePreview = startAndroidLivePreview({
                            source: frameSource,
                            hasViewer: hasWsClients,
                            publish: (data) => broadcast({ type: 'frame', data }),
                            onError: (error) => {
                                console.warn(
                                    `Android 实时预览帧解码失败：${formatErrorMessage(error)}`,
                                );
                            },
                        });
                    }
                } catch (error) {
                    console.warn(
                        `Android 实时预览启动失败，继续使用步骤截图：${formatErrorMessage(error)}`,
                    );
                }
                let cleaned = false;
                this.activeCleanup = async () => {
                    if (cleaned) {
                        return;
                    }
                    cleaned = true;
                    try {
                        await stopLivePreview?.();
                    } finally {
                        await androidAgent.destroy();
                    }
                };
                captureScreenshot = () => device.screenshotBase64();
                currentLocation = () => device.url().then((url) => url || null);
            }

            const steps = flattenSteps(script);
            if (this.state) {
                this.state.totalSteps = steps.length;
            }

            for (let index = 0; index < steps.length; index++) {
                if (this.stopRequested) {
                    this.finish(runId, 'stopped', '手动停止', startedAt, totalInput, totalOutput);
                    return;
                }
                if (this.state) {
                    this.state.currentStepIndex = index;
                }
                const { taskName, taskUrl, step } = steps[index];
                // 先切到步骤组指定的页面，再截图和执行，这样回到 H5 时仍是发验证码的那一页
                await activateStepPage(taskUrl);
                broadcast({
                    type: 'step-start',
                    runId,
                    stepIndex: index,
                    stepName: stepLabel(taskName, step),
                    action: step.action,
                    totalSteps: steps.length,
                });

                const stepDir = path.join(SCREENSHOT_DIR, String(runId));
                mkdirSync(stepDir, { recursive: true });
                const shotBefore = await takeScreenshot(
                    captureScreenshot,
                    stepDir,
                    `${index}-before.jpg`,
                );

                const inputBefore = totalInput;
                const outputBefore = totalOutput;
                const stepStart = Date.now();
                try {
                    const dispatched = await dispatchStep(agent, step, index, launchAndroidApp);
                    const shotAfter = await takeScreenshot(
                        captureScreenshot,
                        stepDir,
                        `${index}-after.jpg`,
                    );
                    const aiResult =
                        dispatched ?? (agent ? extractLastAiResult(agent.dumpDataString()) : null);
                    const clickTarget = clickTargetForStep(step.action, aiResult);
                    if (clickTarget) {
                        await markStoredScreenshots(
                            [shotBefore, shotAfter].map((shot) => path.join(SCREENSHOT_DIR, shot)),
                            clickTarget,
                        );
                    }
                    this.recordStep(runId, index, taskName, step, await currentLocation(), {
                        status: 'success',
                        error: null,
                        aiResult: aiResult ? JSON.stringify(aiResult) : null,
                        shotBefore,
                        shotAfter,
                        durationMs: Date.now() - stepStart,
                        tokenInput: totalInput - inputBefore,
                        tokenOutput: totalOutput - outputBefore,
                    });
                } catch (error) {
                    const shotAfter = await takeScreenshot(
                        captureScreenshot,
                        stepDir,
                        `${index}-after.jpg`,
                    ).catch(() => null);
                    const message = formatStepError(error, step);
                    this.recordStep(runId, index, taskName, step, await currentLocation(), {
                        status: 'failed',
                        error: message,
                        aiResult: null,
                        shotBefore,
                        shotAfter,
                        durationMs: Date.now() - stepStart,
                        tokenInput: totalInput - inputBefore,
                        tokenOutput: totalOutput - outputBefore,
                    });
                    if (this.stopRequested) {
                        this.finish(
                            runId,
                            'stopped',
                            '手动停止',
                            startedAt,
                            totalInput,
                            totalOutput,
                        );
                    } else {
                        this.finish(
                            runId,
                            'failed',
                            `第 ${index + 1} 步（${stepLabel(taskName, step)}）失败：${message}`,
                            startedAt,
                            totalInput,
                            totalOutput,
                        );
                    }
                    return;
                }
            }

            this.finish(runId, 'success', null, startedAt, totalInput, totalOutput);
        } catch (error) {
            this.finish(
                runId,
                this.stopRequested ? 'stopped' : 'failed',
                this.stopRequested ? '手动停止' : formatErrorMessage(error),
                startedAt,
                totalInput,
                totalOutput,
            );
        } finally {
            await stopScreencast?.().catch(() => {});
            await this.browser?.close().catch(() => {});
            await this.activeCleanup?.().catch(() => {});
            this.browser = null;
            this.activeCleanup = null;
            this.state = null;
            if (queueItemId) {
                setQueueStatus(this.db, queueItemId, 'done');
            }
            cleanupOldRuns(this.db, SCREENSHOT_DIR, RUN_KEEP_COUNT);
            broadcast({ type: 'queue', items: listQueue(this.db) });
            // 当前运行收尾完毕，自动调度队列里的下一个
            this.scheduleNext();
        }
    }

    private recordStep(
        runId: number,
        stepIndex: number,
        taskName: string,
        step: FlowStep,
        url: string | null,
        result: {
            status: RunStepRecord['status'];
            error: string | null;
            aiResult: string | null;
            shotBefore: string | null;
            shotAfter: string | null;
            durationMs: number;
            tokenInput: number;
            tokenOutput: number;
        },
    ) {
        const { id } = insertStep(this.db, {
            runId,
            stepIndex,
            stepName: stepLabel(taskName, step),
            action: step.action,
            url,
            prompt: stepPrompt(step),
            aiResult: result.aiResult,
            shotBefore: result.shotBefore,
            shotAfter: result.shotAfter,
            durationMs: result.durationMs,
            tokenInput: result.tokenInput,
            tokenOutput: result.tokenOutput,
            status: result.status,
            error: result.error,
        });
        const steps = listRunSteps(this.db, runId);
        broadcast({ type: 'step', step: steps.find((s) => s.id === id) });
    }

    private finish(
        runId: number,
        status: RunRecord['status'],
        error: string | null,
        startedAt: number,
        tokenInput: number,
        tokenOutput: number,
    ) {
        finishRun(this.db, runId, {
            status,
            error,
            durationMs: Date.now() - startedAt,
            tokenInput,
            tokenOutput,
        });
        broadcast({ type: 'run', run: getRun(this.db, runId) });
    }
}

function flattenSteps(script: ParsedScript): FlatStep[] {
    return script.tasks.flatMap((task) =>
        task.flow.map((step) => ({
            taskName: task.name,
            taskUrl: task.url,
            step,
        })),
    );
}

// 步骤展示名：优先步骤自定义 name，否则用「任务组名」
function stepLabel(taskName: string, step: FlowStep) {
    return step.aux?.name ?? taskName;
}

// 给 AI 的指令原文，用于日志展示
function stepPrompt(step: FlowStep): string | null {
    if (typeof step.params === 'string') {
        return step.params;
    }
    if (step.action === 'aiInput' && typeof step.params === 'object' && step.params !== null) {
        const params = step.params as { locate?: string; value?: unknown };
        return `在「${params.locate}」输入「${params.value}」`;
    }
    return JSON.stringify(step.params);
}

async function takeScreenshot(capture: CaptureScreenshot, dir: string, fileName: string) {
    const base64 = (await capture()).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    broadcast({ type: 'frame', data: base64 });
    await Bun.write(path.join(dir, fileName), Buffer.from(base64, 'base64'));
    return `${path.basename(dir)}/${fileName}`;
}

async function markStoredScreenshots(filePaths: string[], target: ClickTarget) {
    await Promise.all(
        filePaths.map(async (filePath) => {
            const screenshot = Buffer.from(await Bun.file(filePath).arrayBuffer());
            const marked = await markClickOnScreenshot(screenshot, target);
            await Bun.write(filePath, marked);
        }),
    );
}

// 执行单步。返回 AI 结果摘要；返回 null 时由调用方从 Midscene dump 提取
export async function dispatchStep(
    agent: AgentInstance | null,
    step: FlowStep,
    stepIndex: number,
    launchAndroidApp?: LaunchAndroidApp | null,
): Promise<unknown> {
    if (step.action === 'launch') {
        if (!agent || !('launch' in agent)) {
            throw new Error('打开 App 步骤只能由 Android 任务执行');
        }
        if (launchAndroidApp) {
            await launchAndroidApp(String(step.params));
        } else {
            await agent.launch(String(step.params));
        }
        return { launched: step.params };
    }
    if (MOCK_AI) {
        if (stepIndex === MOCK_FAIL_AT) {
            throw new Error('MOCK 模拟的步骤失败');
        }
        if (step.action === 'sleep') {
            await Bun.sleep(Number(step.params));
            return { slept: step.params };
        }
        await Bun.sleep(600);
        return { thought: `MOCK：${step.action} 执行成功`, action: step.action };
    }

    const prompt = typeof step.params === 'string' ? step.params : '';
    switch (step.action) {
        case 'ai':
            return { output: await agent!.ai(prompt) };
        case 'aiTap':
            await agent!.aiTap(prompt);
            return null;
        case 'aiHover':
            await agent!.aiHover(prompt);
            return null;
        case 'aiRightClick':
            await agent!.aiRightClick(prompt);
            return null;
        case 'aiInput': {
            const params = step.params as { locate: string; value: string | number };
            await agent!.aiInput(String(params.value), params.locate);
            return null;
        }
        case 'aiAssert': {
            const result = await agent!.aiAssert(prompt);
            if (result && result.pass === false) {
                throw new Error(`断言不通过：${result.message ?? result.thought ?? prompt}`);
            }
            return result;
        }
        case 'aiWaitFor':
            await agent!.aiWaitFor(prompt, {
                timeoutMs: step.aux?.timeout ?? AI_WAIT_FOR_DEFAULT_TIMEOUT_MS,
            });
            return null;
        case 'aiQuery':
            return { data: await agent!.aiQuery(prompt) };
        case 'aiKeyboardPress': {
            const key =
                typeof step.params === 'object' && step.params !== null
                    ? String((step.params as { key: string }).key)
                    : prompt;
            await agent!.aiKeyboardPress(key);
            return null;
        }
        case 'aiScroll': {
            const params = step.params as {
                direction: 'up' | 'down' | 'left' | 'right';
                scrollType?: string;
                distance?: number;
                locate?: string;
            };
            await agent!.aiScroll(
                {
                    direction: params.direction,
                    scrollType: (params.scrollType ?? 'once') as never,
                    distance: params.distance,
                },
                params.locate,
            );
            return null;
        }
        case 'sleep':
            await Bun.sleep(Number(step.params));
            return { slept: step.params };
        default:
            throw new Error(`未知动作：${step.action}`);
    }
}
