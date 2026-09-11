import type { ModelConfig } from '@lookrun/shared';
import { extractLastAiResult } from '../lib/ai-result';
import type { FlowStep, ParsedScript } from '../lib/yamlflow';

export function stepNeedsModelFamily(input: { targetType: 'web' | 'android'; action: string }) {
    if (input.targetType === 'android') {
        if (input.action === 'launch') {
            return false;
        }
        if (input.action === 'sleep') {
            return false;
        }
        return true;
    }
    return input.action === 'ai';
}

export function scriptNeedsModelFamily(script: ParsedScript) {
    for (const task of script.tasks) {
        for (const step of task.flow) {
            if (stepNeedsModelFamily({ targetType: script.target.type, action: step.action })) {
                return true;
            }
        }
    }
    return false;
}

export function runStartErrors(input: {
    parseOk: boolean;
    parseErrors: string[];
    model: ModelConfig | undefined;
    modelId: string;
    needsFamily: boolean;
    chromeRequired: boolean;
    chromePath: string | null;
}) {
    if (!input.parseOk) {
        return input.parseErrors;
    }
    if (!input.model) {
        return [`模型 ${input.modelId} 不存在`];
    }
    if (input.needsFamily && !input.model.family) {
        return [
            `任务包含「自由指令」步骤，需要模型配置 family；模型「${input.model.name}」没有 family，请改用 kimi，或把该步骤改成具体动作（点击/输入/断言等）`,
        ];
    }
    if (input.chromeRequired && !input.chromePath) {
        return ['未检测到系统 Chrome，请先安装 Google Chrome 浏览器'];
    }
    return [];
}

export function queueItemCanStart(input: {
    hasTask: boolean;
    hasModel: boolean;
    parseOk: boolean;
    chromeRequired: boolean;
    chromePath: string | null;
}) {
    if (!input.hasTask) {
        return false;
    }
    if (!input.hasModel) {
        return false;
    }
    if (!input.parseOk) {
        return false;
    }
    if (input.chromeRequired && !input.chromePath) {
        return false;
    }
    return true;
}

export function stepLabel(taskName: string, step: FlowStep) {
    return step.aux?.name ?? taskName;
}

export function stepPrompt(step: FlowStep) {
    if (typeof step.params === 'string') {
        return step.params;
    }
    if (step.action !== 'aiInput') {
        return JSON.stringify(step.params);
    }
    if (typeof step.params !== 'object' || step.params === null) {
        return JSON.stringify(step.params);
    }
    const params = step.params as { locate?: string; value?: unknown };
    return `在「${params.locate}」输入「${params.value}」`;
}

export function addTokenUsage(
    total: { input: number; output: number },
    usage: Record<string, number | undefined>,
) {
    return {
        input: total.input + (usage.prompt_tokens ?? 0),
        output: total.output + (usage.completion_tokens ?? 0),
    };
}

export function executeFailStatus(stopRequested: boolean) {
    if (stopRequested) {
        return 'stopped' as const;
    }
    return 'failed' as const;
}

export function executeFailError(input: {
    stopRequested: boolean;
    error: unknown;
    format: (error: unknown) => string;
}) {
    if (input.stopRequested) {
        return '手动停止';
    }
    return input.format(input.error);
}

export function requireChromePath(chromePath: string | null) {
    if (chromePath) {
        return chromePath;
    }
    throw new Error('未检测到系统 Chrome，请先安装 Google Chrome 浏览器');
}

export function stringifyAiResult(aiResult: unknown) {
    if (!aiResult) {
        return null;
    }
    return JSON.stringify(aiResult);
}

export function resolvedAiResult(dispatched: unknown, dump: string | null) {
    if (dispatched !== null && dispatched !== undefined) {
        return dispatched;
    }
    if (!dump) {
        return null;
    }
    return extractLastAiResult(dump);
}

export function stepFailError(input: {
    stopRequested: boolean;
    index: number;
    label: string;
    message: string;
}) {
    if (input.stopRequested) {
        return '手动停止';
    }
    return `第 ${input.index + 1} 步（${input.label}）失败：${input.message}`;
}

export function webTargetOf(script: ParsedScript) {
    if (script.target.type !== 'web') {
        throw new Error('网页运行需要 web 目标');
    }
    return script.target;
}

export function androidTargetOf(script: ParsedScript) {
    if (script.target.type !== 'android') {
        throw new Error('Android 运行需要 android 目标');
    }
    return script.target;
}

export const WEB_VIEWPORT_DEFAULT = { width: 390, height: 844 };

export function webViewportSize(target: { viewportWidth?: number; viewportHeight?: number }) {
    return {
        width: target.viewportWidth ?? WEB_VIEWPORT_DEFAULT.width,
        height: target.viewportHeight ?? WEB_VIEWPORT_DEFAULT.height,
    };
}

export function scriptFromParse(
    parseResult: { ok: true; script: ParsedScript } | { ok: false; errors: string[] },
) {
    if (!parseResult.ok) {
        return null;
    }
    return parseResult.script;
}

export function scriptFromParseResult(
    parseResult: { ok: true; script: ParsedScript } | { ok: false; errors: string[] } | null,
) {
    if (!parseResult) {
        return null;
    }
    return scriptFromParse(parseResult);
}

export function parseQueueTaskYaml(
    task: { yaml: string } | null,
    variables: Record<string, string>,
    parse: (
        yaml: string,
        variables: Record<string, string>,
    ) => { ok: true; script: ParsedScript } | { ok: false; errors: string[] },
) {
    if (!task) {
        return null;
    }
    return parse(task.yaml, variables);
}

export function parseErrorList(
    parseResult: { ok: true; script: ParsedScript } | { ok: false; errors: string[] },
) {
    if (parseResult.ok) {
        return [];
    }
    return parseResult.errors;
}

export function webChromeIfWeb(input: {
    targetType: 'web' | 'android' | undefined;
    detect: () => string | null;
}) {
    if (input.targetType !== 'web') {
        return null;
    }
    return input.detect();
}

export function webChromePath(input: {
    parseOk: boolean;
    targetType: 'web' | 'android' | undefined;
    detect: () => string | null;
}) {
    if (!input.parseOk) {
        return null;
    }
    return webChromeIfWeb(input);
}

export function scriptNeedsFamily(script: ParsedScript | null) {
    if (!script) {
        return false;
    }
    return scriptNeedsModelFamily(script);
}

export function queueTaskId(taskId: number | null) {
    return taskId ?? 0;
}

export function presentOrUndefined<T>(value: T | null) {
    if (value === null) {
        return undefined;
    }
    return value;
}

export function flattenSteps(script: ParsedScript) {
    return script.tasks.flatMap((task) =>
        task.flow.map((step) => ({
            taskName: task.name,
            taskUrl: task.url,
            step,
        })),
    );
}
