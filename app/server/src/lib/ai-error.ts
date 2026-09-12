import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { errorText } from './error-text';
import type { FlowStep } from './yamlflow';

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MIN_CHINESE_CHARACTER_COUNT = 4;
const MAX_LATIN_TO_CHINESE_RATIO = 2;
const CHINESE_CHARACTER_PATTERN = /[\u3400-\u9fff]/g;
const LATIN_CHARACTER_PATTERN = /[a-z]/gi;
const LOCATE_ACTIONS = new Set(['aiTap', 'aiHover', 'aiRightClick', 'aiInput']);
const INVALID_API_KEY_HEADER_PATTERN = /header['\s].*invalid value|invalid character in header/i;
const UNAUTHORIZED_API_KEY_PATTERN =
    /401|unauthorized|invalid api key|incorrect api key|invalid_api_key|authentication failed/i;

export const API_KEY_UNCONFIGURED_MESSAGE =
    'API Key 未配置或含有非法字符，请在 models.json 中填写有效的 API Key';
export const API_KEY_UNAUTHORIZED_MESSAGE = 'API Key 无效，请检查 models.json 中的配置';

export function formatModelServiceError(message: string) {
    if (INVALID_API_KEY_HEADER_PATTERN.test(message)) {
        return API_KEY_UNCONFIGURED_MESSAGE;
    }
    if (UNAUTHORIZED_API_KEY_PATTERN.test(message)) {
        return API_KEY_UNAUTHORIZED_MESSAGE;
    }
    return null;
}

function truncateErrorMessage(message: string) {
    if (message.length > MAX_ERROR_MESSAGE_LENGTH) {
        return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
    }
    return message;
}

export function formatErrorMessage(error: unknown) {
    const message = truncateErrorMessage(errorText(error));
    return formatModelServiceError(message) ?? message;
}

const AI_FAILURE_PREFIX: Record<string, string> = {
    aiAssert: '模型执行页面断言失败',
    aiWaitFor: '模型等待页面条件时执行失败',
};

function chineseAiFailure(action: string, goal: string) {
    if (LOCATE_ACTIONS.has(action)) {
        return `模型未能在当前页面中找到目标元素${goal}`;
    }
    return `${AI_FAILURE_PREFIX[action] ?? '模型执行失败'}${goal}`;
}

export function formatStepError(error: unknown, step: FlowStep) {
    const message = formatErrorMessage(error);
    if (!step.action.startsWith('ai') || isPredominantlyChinese(message)) {
        return message;
    }
    return chineseAiFailure(step.action, chineseGoal(step));
}

export function formatRunHistory(run: RunRecord, steps: RunStepRecord[]) {
    const formattedSteps = steps.map((step) => {
        if (!step.error) {
            return step;
        }
        return {
            ...step,
            error: formatStepError(step.error, {
                action: step.action,
                params: step.prompt,
            }),
        };
    });
    const failedStep = formattedSteps.find((step) => step.status === 'failed');
    if (!run.error || !failedStep?.error) {
        return { run, steps: formattedSteps };
    }

    const stepName = failedStep.stepName ?? failedStep.action;
    const errorPrefix = `第 ${failedStep.stepIndex + 1} 步（${stepName}）失败：`;
    if (!run.error.startsWith(errorPrefix)) {
        return { run, steps: formattedSteps };
    }
    return {
        run: { ...run, error: `${errorPrefix}${failedStep.error}` },
        steps: formattedSteps,
    };
}

function isPredominantlyChinese(message: string) {
    const chineseCount = countCharacters(message, CHINESE_CHARACTER_PATTERN);
    const latinCount = countCharacters(message, LATIN_CHARACTER_PATTERN);
    // 少量中文前缀后仍可能跟着模型英文原文，需结合中英文字符占比判断是否兜底。
    return (
        MIN_CHINESE_CHARACTER_COUNT <= chineseCount &&
        latinCount <= chineseCount * MAX_LATIN_TO_CHINESE_RATIO
    );
}

function chineseGoal(step: FlowStep) {
    const goal =
        typeof step.params === 'string' ? step.params : inputTarget(step.action, step.params);
    if (!goal || countCharacters(goal, CHINESE_CHARACTER_PATTERN) === 0) {
        return '';
    }
    return `：${goal}`;
}

function countCharacters(value: string, pattern: RegExp) {
    return value.match(pattern)?.length ?? 0;
}

function inputTarget(action: string, params: unknown) {
    if (
        action !== 'aiInput' ||
        typeof params !== 'object' ||
        params === null ||
        !('locate' in params)
    ) {
        return null;
    }
    return typeof params.locate === 'string' ? params.locate : null;
}
