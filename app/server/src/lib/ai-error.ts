import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { errorText } from './error-text';

const MAX_ERROR_MESSAGE_LENGTH = 500;
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

export function formatRunHistory(run: RunRecord, steps: RunStepRecord[]) {
    const formattedSteps = steps.map((step) => {
        if (!step.error) {
            return step;
        }
        return {
            ...step,
            error: formatErrorMessage(step.error),
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
