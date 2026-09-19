import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { AndroidAgent, AndroidDevice } from '@midscene/android';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import type { Database } from 'bun:sqlite';
import type { ModelConfig, RunRecord, RunStepRecord } from '@lookrun/shared';
import { formatErrorMessage } from '../lib/ai-error';
import { startAndroidLivePreview } from './android-preview';
import { detectChrome } from './chrome';
import { REPORT_DIR, RUN_KEEP_COUNT, SCREENSHOT_DIR } from '../config';
import {
    finishRun,
    getRun,
    getTask,
    insertRun,
    insertStep,
    listRunSteps,
    listVariables,
} from '../db';
import { getModelById, loadModels, tryLoadModels, toMidsceneModelConfig } from './models';
import { enqueue, listQueue, nextPending, requeueInterrupted, setQueueStatus } from './queue';
import { cleanupOldRuns } from './retention';
import {
    clickTargetForStep,
    type ClickTarget,
    markClickOnScreenshot,
} from '../lib/screenshot-marker';
import { startScreencast } from './screencast';
import { broadcast, hasWsClients } from '../lib/ws';
import { activatePageSession } from '../lib/page-session';
import { restrictDirectNavigateFromAgent, searchOnOpenedPageContext } from '../lib/web-agent';
import { parseScript, type FlowStep, type ParsedScript } from '../lib/yamlflow';
import {
    androidAdbPath,
    checkAndroidDevice,
    createDeviceAndroidAppLauncher,
} from './android-service';
import {
    addTokenUsage,
    executeFailError,
    executeFailStatus,
    flattenSteps,
    parseErrorList,
    queueItemCanStart,
    runStartErrors,
    presentOrUndefined,
    parseQueueTaskYaml,
    scriptFromParse,
    scriptFromParseResult,
    scriptNeedsFamily,
    stepLabel,
    stepPrompt,
    queueTaskId,
    requireChromePath,
    resolvedAiResult,
    stepFailError,
    stringifyAiResult,
    androidTargetOf,
    webChromePath,
    webTargetOf,
    webViewportSize,
} from './run-prepare';
import {
    dispatchStepWith,
    mockFailAtFromEnv,
    optionalLauncher,
    type LaunchAndroidApp,
    type StepAgent,
} from './step-dispatch';

// Midscene 自己的 HTML 报告也落到数据目录下，方便需要时翻看
process.env.MIDSCENE_RUN_DIR ??= REPORT_DIR;
// 模型的思考过程、断言结论、定位失败原因统一用中文输出（注入到 Midscene 的提示词里）
process.env.MIDSCENE_PREFERRED_LANGUAGE ??= 'Chinese';

const MOBILE_SCALE_FACTOR = 2;
const PAGE_LOAD_TIMEOUT_MS = 30_000;
const SCREENSHOT_QUALITY = 70;
// MOCK_AI=1 时不调用真实模型，用于无模型环境下验证整条链路
const MOCK_AI = process.env.MOCK_AI === '1';

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

type AgentInstance = InstanceType<typeof PuppeteerAgent> | AndroidAgent;
type AgentPage = ConstructorParameters<typeof PuppeteerAgent>[0];
type CaptureScreenshot = () => Promise<string>;
type RunRuntime = {
    agent: AgentInstance | null;
    captureScreenshot: CaptureScreenshot;
    currentLocation: () => Promise<string | null>;
    launchAndroidApp: LaunchAndroidApp | null;
    activateStepPage: (stepUrl?: string) => Promise<void>;
    cleanup: () => Promise<void>;
};

class RunEnded extends Error {}

const runnerDependencies = {
    detectChrome,
    tryLoadModels,
    loadModels,
    launchBrowser: puppeteer.launch.bind(puppeteer),
    PuppeteerAgent,
    AndroidAgent,
    AndroidDevice,
    startScreencast,
    startAndroidLivePreview,
    checkAndroidDevice,
    androidAdbPath,
    createDeviceAndroidAppLauncher,
    broadcast,
    hasWsClients,
    cleanupOldRuns,
    mkdirSync,
    write: Bun.write,
    file: Bun.file,
    markClickOnScreenshot,
    mockAi: MOCK_AI,
    dispatchStep,
    warn: console.warn,
    error: console.error,
};

export class Runner {
    private state: RunningState | null = null;
    private stopRequested = false;
    private browser: Browser | null = null;
    private activeCleanup: (() => Promise<void>) | null = null;

    private dependencies: typeof runnerDependencies;

    constructor(
        private db: Database,
        dependencies?: Partial<typeof runnerDependencies>,
    ) {
        this.dependencies = { ...runnerDependencies, ...dependencies };
    }

    current() {
        return this.state;
    }

    start(input: { taskId: number | null; taskName: string; yaml: string; modelId: string }) {
        const parseResult = parseScript(input.yaml, listVariables(this.db));
        const script = scriptFromParse(parseResult);
        const model = this.modelForStart(input.modelId);
        const chromePath = webChromePath({
            parseOk: Boolean(script),
            targetType: script?.target.type,
            detect: () => this.dependencies.detectChrome().path,
        });
        const errors = runStartErrors({
            parseOk: Boolean(script),
            parseErrors: parseErrorList(parseResult),
            model: presentOrUndefined(model),
            modelId: input.modelId,
            needsFamily: scriptNeedsFamily(script),
            chromeRequired: script?.target.type === 'web',
            chromePath,
        });
        if (errors.length > 0) {
            throw new ScriptInvalidError(errors);
        }
        return this.enqueueOrRun({
            taskId: input.taskId,
            taskName: input.taskName,
            script: script!,
            model: model!,
            chromePath,
        });
    }

    private modelForStart(modelId: string) {
        const loaded = this.dependencies.tryLoadModels();
        if (!loaded.ok) {
            throw new ScriptInvalidError([loaded.error]);
        }
        return getModelById(loaded.models, modelId);
    }

    private enqueueOrRun(input: {
        taskId: number | null;
        taskName: string;
        script: ParsedScript;
        model: ModelConfig;
        chromePath: string | null;
    }) {
        if (this.state) {
            const queueItem = enqueue(this.db, {
                taskId: queueTaskId(input.taskId),
                taskName: input.taskName,
                modelId: input.model.id,
                model: input.model.model,
            });
            this.dependencies.broadcast({ type: 'queue', items: listQueue(this.db) });
            return { queued: true as const, queueItem };
        }
        const runId = this.runNow(input);
        return { queued: false as const, runId };
    }

    private nextIfIdle() {
        if (this.state) {
            return null;
        }
        return nextPending(this.db);
    }

    private scheduleNext() {
        const next = this.nextIfIdle();
        if (!next) {
            return;
        }
        this.startQueueItem(next);
    }

    private startQueueItem(next: {
        id: number;
        taskId: number;
        taskName: string;
        modelId: string;
    }) {
        try {
            this.startLoadedQueueItem(next);
        } catch (error) {
            this.failQueueItem(next, formatErrorMessage(error));
        }
    }

    private startLoadedQueueItem(next: {
        id: number;
        taskId: number;
        taskName: string;
        modelId: string;
    }) {
        const task = getTask(this.db, next.taskId);
        const model = getModelById(this.dependencies.loadModels(), next.modelId);
        const script = scriptFromParseResult(
            parseQueueTaskYaml(task, listVariables(this.db), parseScript),
        );
        const chromePath = webChromePath({
            parseOk: Boolean(script),
            targetType: script?.target.type,
            detect: () => this.dependencies.detectChrome().path,
        });
        if (
            !queueItemCanStart({
                hasTask: Boolean(task),
                hasModel: Boolean(model),
                parseOk: Boolean(script),
                chromeRequired: script?.target.type === 'web',
                chromePath,
            })
        ) {
            this.skipQueueItem(next.id);
            return;
        }
        this.runNow({
            taskId: next.taskId,
            taskName: next.taskName,
            script: script!,
            model: model!,
            chromePath,
            queueItemId: next.id,
        });
    }

    private skipQueueItem(id: number) {
        setQueueStatus(this.db, id, 'cancelled');
        this.dependencies.broadcast({ type: 'queue', items: listQueue(this.db) });
        this.scheduleNext();
    }

    private failQueueItem(
        next: { id: number; taskId: number; taskName: string; modelId: string },
        error: string,
    ) {
        const { id: runId } = insertRun(this.db, {
            taskId: next.taskId,
            taskName: next.taskName,
            model: next.modelId,
        });
        this.finish(runId, 'failed', error, Date.now(), 0, 0);
        setQueueStatus(this.db, next.id, 'done', runId);
        this.dependencies.broadcast({ type: 'queue', items: listQueue(this.db) });
        this.scheduleNext();
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
        const state: RunningState = {
            runId,
            taskName: input.taskName,
            model: input.model.model,
            startedAt: new Date().toISOString(),
            currentStepIndex: -1,
            totalSteps: 0,
        };
        this.state = state;
        this.stopRequested = false;
        this.dependencies.broadcast({ type: 'run', run: getRun(this.db, runId) });
        this.dependencies.broadcast({ type: 'queue', items: listQueue(this.db) });

        void this.execute({
            runId,
            script: input.script,
            modelConfig: toMidsceneModelConfig(input.model),
            chromePath: input.chromePath,
            queueItemId: input.queueItemId,
            state,
        }).catch((error) => {
            this.dependencies.error(`运行 #${runId} 收尾失败：${formatErrorMessage(error)}`);
        });
        return runId;
    }

    async stop() {
        if (!this.state) {
            return;
        }
        this.stopRequested = true;
        await Promise.all([this.closeBrowser(), this.runActiveCleanup()]);
    }

    private async closeBrowser() {
        const browser = this.browser;
        this.browser = null;
        if (!browser) return;
        try {
            await browser.close();
        } catch (error) {
            this.dependencies.warn(`浏览器清理失败：${formatErrorMessage(error)}`);
        }
    }

    private async runActiveCleanup() {
        const cleanup = this.activeCleanup;
        this.activeCleanup = null;
        if (!cleanup) return;
        try {
            await cleanup();
        } catch (error) {
            this.dependencies.warn(`设备清理失败：${formatErrorMessage(error)}`);
        }
    }

    private async execute(input: {
        runId: number;
        script: ParsedScript;
        modelConfig: Record<string, string>;
        chromePath: string | null;
        queueItemId?: number;
        state: RunningState;
    }) {
        const { runId, script, modelConfig, chromePath, queueItemId, state } = input;
        const startedAt = Date.now();
        const usage = { input: 0, output: 0 };
        let runtime: RunRuntime | null = null;
        try {
            runtime = await this.openRuntime(script, modelConfig, chromePath, usage);
            await this.walkSteps({ runId, script, runtime, startedAt, usage, state });
            this.finish(runId, 'success', null, startedAt, usage.input, usage.output);
        } catch (error) {
            this.handleExecuteError(runId, error, startedAt, usage);
        } finally {
            try {
                await runtime?.cleanup();
            } finally {
                await this.afterExecute(queueItemId);
            }
        }
    }

    private handleExecuteError(
        runId: number,
        error: unknown,
        startedAt: number,
        usage: { input: number; output: number },
    ) {
        if (error instanceof RunEnded) {
            return;
        }
        this.finish(
            runId,
            executeFailStatus(this.stopRequested),
            executeFailError({
                stopRequested: this.stopRequested,
                error,
                format: formatErrorMessage,
            }),
            startedAt,
            usage.input,
            usage.output,
        );
    }

    private async afterExecute(queueItemId?: number) {
        try {
            await Promise.all([this.closeBrowser(), this.runActiveCleanup()]);
        } finally {
            this.state = null;
            if (queueItemId) setQueueStatus(this.db, queueItemId, 'done');
            this.dependencies.cleanupOldRuns(this.db, SCREENSHOT_DIR, RUN_KEEP_COUNT);
            this.dependencies.broadcast({ type: 'queue', items: listQueue(this.db) });
            this.scheduleNext();
        }
    }

    private async openRuntime(
        script: ParsedScript,
        modelConfig: Record<string, string>,
        chromePath: string | null,
        usage: { input: number; output: number },
    ) {
        if (script.target.type === 'web') {
            return this.openWebRuntime(script, chromePath, modelConfig, usage);
        }
        return this.openAndroidRuntime(script, modelConfig, usage);
    }

    private trackUsage(usage: { input: number; output: number }) {
        return (next: Record<string, number | undefined>) => {
            const added = addTokenUsage(usage, next);
            usage.input = added.input;
            usage.output = added.output;
        };
    }

    private async openWebRuntime(
        script: ParsedScript,
        chromePath: string | null,
        modelConfig: Record<string, string>,
        usage: { input: number; output: number },
    ): Promise<RunRuntime> {
        const target = webTargetOf(script);
        const executablePath = requireChromePath(chromePath);
        this.browser = await this.dependencies.launchBrowser({
            executablePath,
            headless: true,
            args: ['--no-first-run', '--no-default-browser-check', '--mute-audio'],
        });
        const size = webViewportSize(target);
        const viewport = {
            width: size.width,
            height: size.height,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: MOBILE_SCALE_FACTOR,
        };
        type WebSession = { page: Page; agent: AgentInstance | null };
        const sessions = new Map<string, WebSession>();
        const openWebPage = (url: string) => this.openWebPage(url, viewport, modelConfig, usage);
        const initial = await activatePageSession({
            requestedUrl: target.url,
            currentKey: null,
            sessions,
            open: openWebPage,
        });
        const web = {
            currentPageKey: initial.key,
            activePage: initial.session.page,
            agent: initial.session.agent,
            stopScreencast: await this.dependencies.startScreencast(initial.session.page),
        };
        return {
            get agent() {
                return web.agent;
            },
            captureScreenshot: async () =>
                String(
                    await web.activePage.screenshot({
                        encoding: 'base64',
                        type: 'jpeg',
                        quality: SCREENSHOT_QUALITY,
                    }),
                ),
            currentLocation: async () => web.activePage.url(),
            launchAndroidApp: null,
            activateStepPage: (stepUrl) =>
                this.activateWebStepPage(stepUrl, web, sessions, openWebPage),
            cleanup: async () => {
                await web.stopScreencast?.().catch(() => {});
            },
        };
    }

    private async openWebPage(
        url: string,
        viewport: {
            width: number;
            height: number;
            isMobile: boolean;
            hasTouch: boolean;
            deviceScaleFactor: number;
        },
        modelConfig: Record<string, string>,
        usage: { input: number; output: number },
    ) {
        const page = await this.browser!.newPage();
        await page.setViewport(viewport);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: PAGE_LOAD_TIMEOUT_MS,
        });
        return {
            page,
            agent: await this.createWebAgent(page, modelConfig, usage, url),
        };
    }

    private async createWebAgent(
        page: Page,
        modelConfig: Record<string, string>,
        usage: { input: number; output: number },
        pageUrl: string,
    ) {
        if (this.dependencies.mockAi) {
            return null;
        }
        const agent = new this.dependencies.PuppeteerAgent(
            page as unknown as AgentPage,
            {
                modelConfig,
                onLLMUsage: this.trackUsage(usage),
                aiActContext: searchOnOpenedPageContext(pageUrl),
            } as ConstructorParameters<typeof PuppeteerAgent>[1],
        );
        await restrictDirectNavigateFromAgent(agent, pageUrl);
        return agent;
    }

    private async activateWebStepPage(
        stepUrl: string | undefined,
        web: {
            currentPageKey: string;
            activePage: Page;
            agent: AgentInstance | null;
            stopScreencast: (() => Promise<void>) | null;
        },
        sessions: Map<string, { page: Page; agent: AgentInstance | null }>,
        openWebPage: (url: string) => Promise<{ page: Page; agent: AgentInstance | null }>,
    ) {
        const next = await activatePageSession({
            requestedUrl: stepUrl,
            currentKey: web.currentPageKey,
            sessions,
            open: openWebPage,
        });
        if (next.key === web.currentPageKey) {
            return;
        }
        web.currentPageKey = next.key;
        web.activePage = next.session.page;
        web.agent = next.session.agent;
        await web.stopScreencast?.().catch(() => {});
        web.stopScreencast = await this.dependencies.startScreencast(web.activePage);
        await web.activePage.bringToFront().catch(() => {});
    }

    private async openAndroidRuntime(
        script: ParsedScript,
        modelConfig: Record<string, string>,
        usage: { input: number; output: number },
    ): Promise<RunRuntime> {
        const target = androidTargetOf(script);
        const checkResult = await this.dependencies.checkAndroidDevice(target.deviceId);
        if (!checkResult.ok) {
            throw new Error(checkResult.message);
        }
        const device = new this.dependencies.AndroidDevice(target.deviceId, {
            androidAdbPath: this.dependencies.androidAdbPath(),
            scrcpyConfig: { enabled: true },
        });
        await device.connect();
        const androidAgent = new this.dependencies.AndroidAgent(device, {
            modelConfig,
            onLLMUsage: this.trackUsage(usage),
        });
        const stopLivePreview = await this.startAndroidPreview(device);
        this.activeCleanup = async () => {
            try {
                await stopLivePreview?.();
            } finally {
                await androidAgent.destroy();
            }
        };
        return {
            agent: androidAgent,
            captureScreenshot: () => device.screenshotBase64(),
            currentLocation: () => device.url().then((url) => url || null),
            launchAndroidApp: this.dependencies.createDeviceAndroidAppLauncher({
                deviceId: target.deviceId,
                directLaunch: (target) => androidAgent.launch(target),
            }),
            activateStepPage: async () => {},
            cleanup: async () => {},
        };
    }

    private async startAndroidPreview(device: AndroidDevice) {
        try {
            return await this.connectAndroidPreview(device);
        } catch (error) {
            console.warn(
                `Android 实时预览启动失败，继续使用步骤截图：${formatErrorMessage(error)}`,
            );
            return null;
        }
    }

    private async connectAndroidPreview(device: AndroidDevice) {
        const frameSource = await device.openFrameSource?.();
        if (!frameSource) {
            return null;
        }
        return this.dependencies.startAndroidLivePreview({
            source: frameSource,
            hasViewer: this.dependencies.hasWsClients,
            publish: (data) => this.dependencies.broadcast({ type: 'frame', data }),
            onError: (error) => {
                console.warn(`Android 实时预览帧解码失败：${formatErrorMessage(error)}`);
            },
        });
    }

    private async walkSteps(input: {
        runId: number;
        script: ParsedScript;
        runtime: RunRuntime;
        startedAt: number;
        usage: { input: number; output: number };
        state: RunningState;
    }) {
        const { runId, script, runtime, startedAt, usage, state } = input;
        const steps = flattenSteps(script);
        state.totalSteps = steps.length;
        for (let index = 0; index < steps.length; index++) {
            if (this.stopRequested) {
                this.finish(runId, 'stopped', '手动停止', startedAt, usage.input, usage.output);
                throw new RunEnded();
            }
            state.currentStepIndex = index;
            await this.processOneStep({
                runId,
                index,
                item: steps[index],
                runtime,
                startedAt,
                usage,
                totalSteps: steps.length,
            });
        }
    }

    private async processOneStep(input: {
        runId: number;
        index: number;
        item: ReturnType<typeof flattenSteps>[number];
        runtime: RunRuntime;
        startedAt: number;
        usage: { input: number; output: number };
        totalSteps: number;
    }) {
        const { runId, index, item, runtime, startedAt, usage, totalSteps } = input;
        await runtime.activateStepPage(item.taskUrl);
        this.dependencies.broadcast({
            type: 'step-start',
            runId,
            stepIndex: index,
            stepName: stepLabel(item.taskName, item.step),
            action: item.step.action,
            totalSteps,
        });
        const stepDir = path.join(SCREENSHOT_DIR, String(runId));
        this.dependencies.mkdirSync(stepDir, { recursive: true });
        const shotBefore = await this.takeScreenshot(
            runtime.captureScreenshot,
            stepDir,
            `${index}-before.jpg`,
        );
        const usageBefore = { input: usage.input, output: usage.output };
        const stepStart = Date.now();
        try {
            await this.recordSuccessfulStep({
                runId,
                index,
                item,
                runtime,
                shotBefore,
                stepDir,
                stepStart,
                usage,
                usageBefore,
            });
        } catch (error) {
            await this.recordFailedStep({
                runId,
                index,
                item,
                runtime,
                shotBefore,
                stepDir,
                stepStart,
                startedAt,
                usage,
                usageBefore,
                error,
            });
            throw new RunEnded();
        }
    }

    private async recordSuccessfulStep(input: {
        runId: number;
        index: number;
        item: ReturnType<typeof flattenSteps>[number];
        runtime: RunRuntime;
        shotBefore: string;
        stepDir: string;
        stepStart: number;
        usage: { input: number; output: number };
        usageBefore: { input: number; output: number };
    }) {
        const dispatched = await this.dependencies.dispatchStep(
            input.runtime.agent,
            input.item.step,
            input.index,
            input.runtime.launchAndroidApp,
        );
        const shotAfter = await this.takeScreenshot(
            input.runtime.captureScreenshot,
            input.stepDir,
            `${input.index}-after.jpg`,
        );
        const dump = this.agentDump(input.runtime.agent);
        const aiResult = resolvedAiResult(dispatched, dump);
        const clickTarget = clickTargetForStep(input.item.step.action, aiResult);
        if (clickTarget) {
            await this.markStoredScreenshots(
                [input.shotBefore, shotAfter].map((shot) => path.join(SCREENSHOT_DIR, shot)),
                clickTarget,
            );
        }
        this.recordStep(
            input.runId,
            input.index,
            input.item.taskName,
            input.item.step,
            await input.runtime.currentLocation(),
            {
                status: 'success',
                error: null,
                aiResult: stringifyAiResult(aiResult),
                shotBefore: input.shotBefore,
                shotAfter,
                durationMs: Date.now() - input.stepStart,
                tokenInput: input.usage.input - input.usageBefore.input,
                tokenOutput: input.usage.output - input.usageBefore.output,
            },
        );
    }

    private agentDump(agent: AgentInstance | null) {
        if (!agent) {
            return null;
        }
        return agent.dumpDataString();
    }

    private async recordFailedStep(input: {
        runId: number;
        index: number;
        item: ReturnType<typeof flattenSteps>[number];
        runtime: RunRuntime;
        shotBefore: string;
        stepDir: string;
        stepStart: number;
        startedAt: number;
        usage: { input: number; output: number };
        usageBefore: { input: number; output: number };
        error: unknown;
    }) {
        const shotAfter = await this.takeScreenshot(
            input.runtime.captureScreenshot,
            input.stepDir,
            `${input.index}-after.jpg`,
        ).catch(() => null);
        const message = formatErrorMessage(input.error);
        this.recordStep(
            input.runId,
            input.index,
            input.item.taskName,
            input.item.step,
            await input.runtime.currentLocation(),
            {
                status: 'failed',
                error: message,
                aiResult: null,
                shotBefore: input.shotBefore,
                shotAfter,
                durationMs: Date.now() - input.stepStart,
                tokenInput: input.usage.input - input.usageBefore.input,
                tokenOutput: input.usage.output - input.usageBefore.output,
            },
        );
        this.finish(
            input.runId,
            executeFailStatus(this.stopRequested),
            stepFailError({
                stopRequested: this.stopRequested,
                index: input.index,
                label: stepLabel(input.item.taskName, input.item.step),
                message,
            }),
            input.startedAt,
            input.usage.input,
            input.usage.output,
        );
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
        this.dependencies.broadcast({ type: 'step', step: steps.find((s) => s.id === id) });
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
        this.dependencies.broadcast({ type: 'run', run: getRun(this.db, runId) });
    }

    private async takeScreenshot(capture: CaptureScreenshot, dir: string, fileName: string) {
        const base64 = (await capture()).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        this.dependencies.broadcast({ type: 'frame', data: base64 });
        await this.dependencies.write(path.join(dir, fileName), Buffer.from(base64, 'base64'));
        return `${path.basename(dir)}/${fileName}`;
    }

    private async markStoredScreenshots(filePaths: string[], target: ClickTarget) {
        await Promise.all(
            filePaths.map(async (filePath) => {
                const screenshot = Buffer.from(
                    await this.dependencies.file(filePath).arrayBuffer(),
                );
                const marked = await this.dependencies.markClickOnScreenshot(screenshot, target);
                await this.dependencies.write(filePath, marked);
            }),
        );
    }
}

export async function dispatchStep(
    agent: AgentInstance | null,
    step: FlowStep,
    stepIndex: number,
    launchAndroidApp?: LaunchAndroidApp | null,
) {
    return dispatchStepWith({
        agent: agent as StepAgent,
        step,
        stepIndex,
        launchAndroidApp: optionalLauncher(launchAndroidApp),
        mockAi: MOCK_AI,
        mockFailAt: mockFailAtFromEnv(process.env.MOCK_FAIL_AT),
        sleep: Bun.sleep,
    });
}
