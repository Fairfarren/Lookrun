import { parseDocument } from 'yaml';

// 当前支持的 flow 动作，与 Midscene 的 YAML 脚本格式对齐
export const SUPPORTED_ACTIONS = [
    'ai',
    'aiTap',
    'aiHover',
    'aiRightClick',
    'aiInput',
    'aiAssert',
    'aiWaitFor',
    'aiQuery',
    'aiKeyboardPress',
    'aiScroll',
    'sleep',
    'launch',
] as const;

export interface FlowStep {
    action: string;
    params: unknown;
    // 步骤辅助配置：name 可为任意步骤命名，timeout 仅 aiWaitFor 可用
    aux?: {
        name?: string;
        timeout?: number;
    };
}

export interface FlowTask {
    name: string;
    // 步骤组页面地址：相同地址复用已打开的页面，适合 H5 发码后再去后台接码
    url?: string;
    flow: FlowStep[];
}

export type ParsedTarget =
    | {
          type: 'web';
          url: string;
          viewportWidth?: number;
          viewportHeight?: number;
      }
    | {
          type: 'android';
          deviceId: string;
      };

export interface ParsedScript {
    target: ParsedTarget;
    tasks: FlowTask[];
}

export type ParseResult = { ok: true; script: ParsedScript } | { ok: false; errors: string[] };

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

// 把 YAML 文本里的 {{变量}} 替换为变量表中的值，未定义的变量保留原样交给解析阶段统一报错
export function substituteVariables(text: string, variables: Record<string, string>) {
    return text.replace(VARIABLE_PATTERN, (raw, name: string) => variables[name] ?? raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function actionKeysOf(step: Record<string, unknown>) {
    return Object.keys(step).filter((key) => key !== 'name' && key !== 'timeout' && key !== 'url');
}

function validateTimeout(
    prefix: string,
    step: Record<string, unknown>,
    action: string,
    errors: string[],
) {
    if (!('timeout' in step)) {
        return;
    }
    if (action !== 'aiWaitFor') {
        errors.push(`${prefix}：timeout 只能用于 aiWaitFor 步骤`);
    }
    if (typeof step.timeout !== 'number' || step.timeout <= 0) {
        errors.push(`${prefix}：timeout 必须是正数毫秒`);
    }
}

function validateAuxFields(input: {
    prefix: string;
    step: Record<string, unknown>;
    action: string;
    errors: string[];
}) {
    const { prefix, step, action, errors } = input;
    validateTimeout(prefix, step, action, errors);
    if ('name' in step && typeof step.name !== 'string') {
        errors.push(`${prefix}：name 必须是字符串`);
    }
}

function validateLaunch(input: {
    prefix: string;
    params: unknown;
    targetType: ParsedTarget['type'];
    errors: string[];
}) {
    const { prefix, params, targetType, errors } = input;
    if (targetType !== 'android') {
        errors.push(`${prefix}（launch）：打开 App 只能用于 Android 任务`);
    }
    if (typeof params !== 'string' || params === '') {
        errors.push(`${prefix}（launch）：需要填写 App 名称、包名或包名/Activity`);
    }
}

function validateAiInput(prefix: string, params: unknown, errors: string[]) {
    if (!isRecord(params) || typeof params.locate !== 'string' || params.locate === '') {
        errors.push(`${prefix}（aiInput）：需要 locate 字段描述输入框位置`);
    }
    if (!isRecord(params) || params.value === undefined || params.value === null) {
        errors.push(`${prefix}（aiInput）：需要 value 字段填写输入内容`);
    }
}

function androidRejectsAction(targetType: ParsedTarget['type'], action: string) {
    return targetType === 'android' && (action === 'aiHover' || action === 'aiRightClick');
}

function missingActionContent(params: unknown) {
    return params === undefined || params === null || params === '';
}

function validateSleep(input: { prefix: string; params: unknown; errors: string[] }) {
    const { prefix, params, errors } = input;
    if (typeof params !== 'number' || params <= 0) {
        errors.push(`${prefix}（sleep）：等待毫秒数必须是正数`);
    }
}

function invalidScrollDirection(params: unknown) {
    return !isRecord(params) || !['up', 'down', 'left', 'right'].includes(String(params.direction));
}

function validateScroll(input: { prefix: string; params: unknown; errors: string[] }) {
    const { prefix, params, errors } = input;
    if (invalidScrollDirection(params)) {
        errors.push(`${prefix}（aiScroll）：direction 必须是 up/down/left/right 之一`);
    }
}

function validateActionParams(input: {
    prefix: string;
    action: string;
    params: unknown;
    targetType: ParsedTarget['type'];
    errors: string[];
}) {
    const { prefix, action, params, targetType, errors } = input;
    if (action === 'launch') {
        validateLaunch({ prefix, params, targetType, errors });
        return;
    }
    if (androidRejectsAction(targetType, action)) {
        errors.push(`${prefix}（${action}）：Android 任务不支持该动作`);
        return;
    }
    const validators: Record<string, () => void> = {
        aiInput: () => validateAiInput(prefix, params, errors),
        sleep: () => validateSleep({ prefix, params, errors }),
        aiScroll: () => validateScroll({ prefix, params, errors }),
    };
    const validate = validators[action];
    if (validate) {
        validate();
        return;
    }
    if (missingActionContent(params)) {
        errors.push(`${prefix}（${action}）：缺少指令内容`);
    }
}

function validateStep(
    index: number,
    step: unknown,
    targetType: ParsedTarget['type'],
    errors: string[],
) {
    const prefix = `第 ${index + 1} 步`;
    if (!isRecord(step)) {
        errors.push(`${prefix}：步骤必须是一个动作对象`);
        return;
    }
    if ('url' in step) {
        errors.push(`${prefix}：url 应写在步骤组上，不要写在单个步骤里`);
    }
    const actionKeys = actionKeysOf(step);
    if (actionKeys.length !== 1) {
        errors.push(
            `${prefix}：一个步骤只能写一个动作，当前写了 ${actionKeys.length} 个（${actionKeys.join('、')}）`,
        );
        return;
    }
    const action = actionKeys[0];
    if (!(SUPPORTED_ACTIONS as readonly string[]).includes(action)) {
        errors.push(`${prefix}：不支持的动作 "${action}"，支持：${SUPPORTED_ACTIONS.join('、')}`);
        return;
    }
    validateAuxFields({ prefix, step, action, errors });
    validateActionParams({ prefix, action, params: step[action], targetType, errors });
}

function collectUnresolvedVariables(yamlText: string, variables: Record<string, string>) {
    const unresolved = new Set<string>();
    for (const match of yamlText.matchAll(VARIABLE_PATTERN)) {
        if (!(match[1] in variables)) {
            unresolved.add(match[1]);
        }
    }
    return [...unresolved];
}

function parseAndroidTarget(doc: Record<string, unknown>, errors: string[]): ParsedTarget {
    if (
        !isRecord(doc.android) ||
        typeof doc.android.deviceId !== 'string' ||
        doc.android.deviceId === ''
    ) {
        errors.push('android.deviceId 必须是非空设备号');
    }
    return {
        type: 'android',
        deviceId:
            isRecord(doc.android) && typeof doc.android.deviceId === 'string'
                ? doc.android.deviceId
                : '',
    };
}

function parseScriptTarget(doc: Record<string, unknown>, errors: string[]): ParsedTarget {
    const hasWebTarget = doc.target !== undefined;
    const hasAndroidTarget = doc.android !== undefined;
    if (hasWebTarget && hasAndroidTarget) {
        errors.push('网页 target 和 android 只能配置一个');
    }
    if (hasAndroidTarget) {
        return parseAndroidTarget(doc, errors);
    }
    return parseWebTarget(doc, errors);
}

function parseViewport(doc: Record<string, unknown>, errors: string[]) {
    const viewport: { viewportWidth?: number; viewportHeight?: number } = {};
    for (const field of ['viewportWidth', 'viewportHeight'] as const) {
        const value = doc[field];
        if (value === undefined) continue;
        if (typeof value !== 'number') {
            errors.push(`${field} 必须是数字`);
        } else {
            viewport[field] = value;
        }
    }
    return viewport;
}

function parseWebTarget(doc: Record<string, unknown>, errors: string[]): ParsedTarget {
    if (typeof doc.target !== 'string' || doc.target === '') {
        errors.push('缺少 target 字段（被测页面地址）');
    } else if (!/^https?:\/\//.test(doc.target)) {
        errors.push(`target 必须是 http(s) 地址，当前是：${doc.target}`);
    }
    const viewport = parseViewport(doc, errors);
    return {
        type: 'web',
        url: String(doc.target ?? ''),
        viewportWidth: viewport.viewportWidth,
        viewportHeight: viewport.viewportHeight,
    };
}

function parseTaskUrl(
    task: Record<string, unknown>,
    targetType: ParsedTarget['type'],
    prefix: string,
    errors: string[],
) {
    if (task.url === undefined) {
        return undefined;
    }
    if (targetType !== 'web') {
        errors.push(`${prefix}：url 只能用于网页任务`);
        return undefined;
    }
    if (typeof task.url !== 'string' || task.url.trim() === '') {
        errors.push(`${prefix}：url 必须是非空字符串`);
        return undefined;
    }
    if (!/^https?:\/\//.test(task.url.trim())) {
        errors.push(`${prefix}：url 必须是 http(s) 地址，当前是：${task.url}`);
        return undefined;
    }
    return task.url.trim();
}

function toFlowStep(step: Record<string, unknown>): FlowStep {
    const action = actionKeysOf(step)[0];
    return {
        action,
        params: step[action],
        aux: {
            name: typeof step.name === 'string' ? step.name : undefined,
            timeout: typeof step.timeout === 'number' ? step.timeout : undefined,
        },
    };
}

function parseTask(
    task: unknown,
    taskIndex: number,
    targetType: ParsedTarget['type'],
    errors: string[],
): FlowTask | null {
    const prefix = `任务 ${taskIndex + 1}`;
    if (!isRecord(task)) {
        errors.push(`${prefix}：必须是对象`);
        return null;
    }
    if (typeof task.name !== 'string' || task.name === '') {
        errors.push(`${prefix}：缺少 name 字段（步骤组名称）`);
    }
    const taskUrl = parseTaskUrl(task, targetType, prefix, errors);
    if (!Array.isArray(task.flow) || task.flow.length === 0) {
        errors.push(`${prefix}：flow 必须是非空数组`);
        return null;
    }
    const flow: FlowStep[] = [];
    task.flow.forEach((step: unknown, stepIndex: number) => {
        validateStep(stepIndex, step, targetType, errors);
        if (isRecord(step)) {
            flow.push(toFlowStep(step));
        }
    });
    return { name: String(task.name ?? ''), url: taskUrl, flow };
}

function yamlErrorMessage(error: unknown) {
    return error instanceof Error ? error.message.split('\n')[0] : String(error);
}

function loadYamlDoc(input: {
    yamlText: string;
    variables: Record<string, string>;
    errors: string[];
}) {
    const { yamlText, variables, errors } = input;
    try {
        return parseDocument(substituteVariables(yamlText, variables)).toJS();
    } catch (error) {
        errors.push(`YAML 语法错误：${yamlErrorMessage(error)}`);
        return null;
    }
}

function parseTaskList(input: {
    doc: Record<string, unknown>;
    target: ParsedTarget;
    errors: string[];
}) {
    const { doc, target, errors } = input;
    if (!Array.isArray(doc.tasks) || doc.tasks.length === 0) {
        errors.push('tasks 必须是非空数组');
        return null;
    }
    const tasks: FlowTask[] = [];
    for (const [taskIndex, task] of doc.tasks.entries()) {
        const parsed = parseTask(task, taskIndex, target.type, errors);
        if (parsed) {
            tasks.push(parsed);
        }
    }
    return tasks;
}

export function parseScript(yamlText: string, variables: Record<string, string>): ParseResult {
    const errors: string[] = [];
    const unresolved = collectUnresolvedVariables(yamlText, variables);
    if (unresolved.length > 0) {
        errors.push(`存在未定义的变量：${unresolved.join('、')}（请先在「设置-变量」里配置）`);
    }

    const doc = loadYamlDoc({ yamlText, variables, errors });
    if (doc === null) {
        return { ok: false, errors };
    }
    if (!isRecord(doc)) {
        errors.push('脚本内容必须是一个 YAML 对象');
        return { ok: false, errors };
    }

    const target = parseScriptTarget(doc, errors);
    const tasks = parseTaskList({ doc, target, errors });
    if (tasks === null || errors.length > 0) {
        return { ok: false, errors };
    }
    return { ok: true, script: { target, tasks } };
}
