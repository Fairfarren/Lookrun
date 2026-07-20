import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import type { Database } from 'bun:sqlite';
import type { RunRecord, RunStepRecord } from '../shared/types';
import { extractLastAiResult } from './ai-result';
import { detectChrome } from './chrome';
import { REPORT_DIR, RUN_KEEP_COUNT, SCREENSHOT_DIR } from './config';
import { finishRun, getRun, insertRun, insertStep, listRunSteps, listVariables } from './db';
import { getModelById, loadModels, toMidsceneModelConfig } from './models';
import { cleanupOldRuns } from './retention';
import { startScreencast } from './screencast';
import { broadcast } from './ws';
import { parseScript, type FlowStep, type ParsedScript } from './yamlflow';

// Midscene 自己的 HTML 报告也落到数据目录下，方便需要时翻看
process.env.MIDSCENE_RUN_DIR ??= REPORT_DIR;

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const PAGE_LOAD_TIMEOUT_MS = 30_000;
const AI_WAIT_FOR_DEFAULT_TIMEOUT_MS = 15_000;
const SCREENSHOT_QUALITY = 70;
// MOCK_AI=1 时不调用真实模型，用于无模型环境下验证整条链路
const MOCK_AI = process.env.MOCK_AI === '1';
// MOCK_FAIL_AT=N 时让第 N 步（从 0 开始）失败，用于验证失败即停
const MOCK_FAIL_AT = process.env.MOCK_FAIL_AT === undefined ? -1 : Number(process.env.MOCK_FAIL_AT);

export class RunnerBusyError extends Error {
  constructor() {
    super('已有任务正在运行，同一时间只能执行一个任务');
  }
}

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
  step: FlowStep;
}

type AgentInstance = InstanceType<typeof PuppeteerAgent>;
type AgentPage = ConstructorParameters<typeof PuppeteerAgent>[0];

export class Runner {
  private state: RunningState | null = null;
  private stopRequested = false;
  private browser: Browser | null = null;

  constructor(private db: Database) {}

  current() {
    return this.state;
  }

  // 启动一次运行：校验脚本与模型后立即返回 runId，执行在后台进行
  start(input: { taskId: number | null; taskName: string; yaml: string; modelId: string }) {
    if (this.state) {
      throw new RunnerBusyError();
    }
    const parseResult = parseScript(input.yaml, listVariables(this.db));
    if (!parseResult.ok) {
      throw new ScriptInvalidError(parseResult.errors);
    }
    const model = getModelById(loadModels(), input.modelId);
    if (!model) {
      throw new ScriptInvalidError([`模型 ${input.modelId} 不存在`]);
    }
    const chrome = detectChrome();
    if (!chrome.path) {
      throw new ScriptInvalidError(['未检测到系统 Chrome，请先安装 Google Chrome 浏览器']);
    }

    const { id: runId } = insertRun(this.db, { taskId: input.taskId, taskName: input.taskName, model: model.model });
    this.state = {
      runId,
      taskName: input.taskName,
      model: model.model,
      startedAt: new Date().toISOString(),
      currentStepIndex: -1,
      totalSteps: 0,
    };
    this.stopRequested = false;
    broadcast({ type: 'run', run: getRun(this.db, runId) });

    void this.execute(runId, parseResult.script, model.model, toMidsceneModelConfig(model), chrome.path);
    return { runId };
  }

  async stop() {
    if (!this.state) {
      return;
    }
    this.stopRequested = true;
    // 关闭浏览器让进行中的 AI 调用立即中断，由执行循环收尾标记 stopped
    await this.browser?.close().catch(() => {});
  }

  private async execute(
    runId: number,
    script: ParsedScript,
    modelName: string,
    modelConfig: Record<string, string>,
    chromePath: string,
  ) {
    const startedAt = Date.now();
    let stopScreencast: (() => Promise<void>) | null = null;
    let totalInput = 0;
    let totalOutput = 0;

    try {
      this.browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-first-run', '--no-default-browser-check', '--mute-audio'],
      });
      const page = await this.browser.newPage();
      const viewport = {
        width: script.viewportWidth ?? DEFAULT_VIEWPORT.width,
        height: script.viewportHeight ?? DEFAULT_VIEWPORT.height,
      };
      await page.setViewport(viewport);
      stopScreencast = await startScreencast(page);

      const agent = MOCK_AI
        ? null
        : new PuppeteerAgent(page as unknown as AgentPage, {
            modelConfig,
            onLLMUsage: (usage: Record<string, number | undefined>) => {
              totalInput += usage.prompt_tokens ?? 0;
              totalOutput += usage.completion_tokens ?? 0;
            },
          } as ConstructorParameters<typeof PuppeteerAgent>[1]);

      await page.goto(script.target, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT_MS });

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
        const { taskName, step } = steps[index];
        broadcast({ type: 'step-start', runId, stepIndex: index, stepName: stepLabel(taskName, step), action: step.action, totalSteps: steps.length });

        const stepDir = path.join(SCREENSHOT_DIR, String(runId));
        mkdirSync(stepDir, { recursive: true });
        const shotBefore = await takeScreenshot(page, stepDir, `${index}-before.jpg`);

        const inputBefore = totalInput;
        const outputBefore = totalOutput;
        const stepStart = Date.now();
        try {
          const dispatched = await dispatchStep(agent, step, index, page);
          const shotAfter = await takeScreenshot(page, stepDir, `${index}-after.jpg`);
          const aiResult = dispatched ?? (agent ? extractLastAiResult(agent.dumpDataString()) : null);
          this.recordStep(runId, index, taskName, step, page.url(), {
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
          const shotAfter = await takeScreenshot(page, stepDir, `${index}-after.jpg`).catch(() => null);
          const message = errorMessage(error);
          this.recordStep(runId, index, taskName, step, page.url(), {
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
            this.finish(runId, 'stopped', '手动停止', startedAt, totalInput, totalOutput);
          } else {
            this.finish(runId, 'failed', `第 ${index + 1} 步（${stepLabel(taskName, step)}）失败：${message}`, startedAt, totalInput, totalOutput);
          }
          return;
        }
      }

      this.finish(runId, 'success', null, startedAt, totalInput, totalOutput);
    } catch (error) {
      this.finish(
        runId,
        this.stopRequested ? 'stopped' : 'failed',
        this.stopRequested ? '手动停止' : errorMessage(error),
        startedAt,
        totalInput,
        totalOutput,
      );
    } finally {
      await stopScreencast?.().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.browser = null;
      this.state = null;
      cleanupOldRuns(this.db, SCREENSHOT_DIR, RUN_KEEP_COUNT);
    }
  }

  private recordStep(
    runId: number,
    stepIndex: number,
    taskName: string,
    step: FlowStep,
    url: string,
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

  private finish(runId: number, status: RunRecord['status'], error: string | null, startedAt: number, tokenInput: number, tokenOutput: number) {
    finishRun(this.db, runId, { status, error, durationMs: Date.now() - startedAt, tokenInput, tokenOutput });
    broadcast({ type: 'run', run: getRun(this.db, runId) });
  }
}

function flattenSteps(script: ParsedScript): FlatStep[] {
  return script.tasks.flatMap((task) => task.flow.map((step) => ({ taskName: task.name, step })));
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

async function takeScreenshot(page: Page, dir: string, fileName: string) {
  const base64 = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: SCREENSHOT_QUALITY });
  await Bun.write(path.join(dir, fileName), Buffer.from(base64, 'base64'));
  return `${path.basename(dir)}/${fileName}`;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

// 执行单步。返回 AI 结果摘要；返回 null 时由调用方从 Midscene dump 提取
async function dispatchStep(agent: AgentInstance | null, step: FlowStep, stepIndex: number, page: Page): Promise<unknown> {
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
      await agent!.aiWaitFor(prompt, { timeoutMs: step.aux?.timeout ?? AI_WAIT_FOR_DEFAULT_TIMEOUT_MS });
      return null;
    case 'aiQuery':
      return { data: await agent!.aiQuery(prompt as never) };
    case 'aiKeyboardPress': {
      const key = typeof step.params === 'object' && step.params !== null ? String((step.params as { key: string }).key) : prompt;
      await agent!.aiKeyboardPress(key);
      return null;
    }
    case 'aiScroll': {
      const params = step.params as { direction: 'up' | 'down' | 'left' | 'right'; scrollType?: string; distance?: number; locate?: string };
      await agent!.aiScroll(
        { direction: params.direction, scrollType: (params.scrollType ?? 'once') as never, distance: params.distance },
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
