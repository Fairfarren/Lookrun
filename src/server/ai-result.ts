// 从 Midscene 的 dumpDataString() 产物中提取最近一次执行的 AI 识别摘要：
// 动作名、最后的思考过程、定位到的元素（坐标/矩形）、断言结果、查询数据
// dump 结构复杂且随版本变化，所有取值都做防御性判断，提取失败返回 null

export interface AiResultSummary {
    action: string;
    thought?: string;
    element?: {
        rect?: unknown;
        center?: unknown;
    };
    assertPass?: boolean;
    data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDumpJson(dumpJson: string) {
    try {
        return JSON.parse(dumpJson);
    } catch {
        return null;
    }
}

function lastExecutionOf(dump: unknown) {
    if (!isRecord(dump) || !Array.isArray(dump.executions) || dump.executions.length === 0) {
        return null;
    }
    const lastExecution = dump.executions[dump.executions.length - 1];
    if (!isRecord(lastExecution) || !Array.isArray(lastExecution.tasks)) {
        return null;
    }
    return { name: lastExecution.name, tasks: lastExecution.tasks };
}

function executionName(name: unknown) {
    return typeof name === 'string' ? name : 'unknown';
}

export function extractLastAiResult(dumpJson: string): AiResultSummary | null {
    const lastExecution = lastExecutionOf(parseDumpJson(dumpJson));
    if (!lastExecution) {
        return null;
    }
    const summary: AiResultSummary = { action: executionName(lastExecution.name) };
    for (const task of [...lastExecution.tasks].reverse()) {
        applyTaskToSummary(summary, task);
    }
    return summary;
}

function firstNonEmpty(current: string | undefined, value: unknown) {
    if (current !== undefined || typeof value !== 'string' || value === '') {
        return current;
    }
    return value;
}

function applyOutputToSummary(summary: AiResultSummary, output: Record<string, unknown>) {
    if (summary.element === undefined && isRecord(output.element)) {
        summary.element = { rect: output.element.rect, center: output.element.center };
    }
    if (summary.assertPass === undefined && typeof output.pass === 'boolean') {
        summary.assertPass = output.pass;
    }
    summary.thought = firstNonEmpty(summary.thought, output.thought);
    if (summary.data === undefined && 'data' in output) {
        summary.data = output.data;
    }
}

function applyTaskToSummary(summary: AiResultSummary, task: unknown) {
    if (!isRecord(task)) {
        return;
    }
    summary.thought = firstNonEmpty(summary.thought, task.thought);
    if (isRecord(task.output)) {
        applyOutputToSummary(summary, task.output);
    }
}
