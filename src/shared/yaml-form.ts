import { parse, stringify } from 'yaml';

// 表单编辑模式的数据结构：与 YAML 双向转换，YAML 仍是唯一存储格式
// 这里只表达表单能覆盖的动作子集；超出子集的内容（xpath/deepLocate 等高级参数）
// 解析回表单时会返回失败，由界面降级到 YAML 高级模式

export interface FormStep {
    id: string;
    action: string;
    // 步骤自定义名称，对应 YAML 的 name 辅助键
    name?: string;
    params: Record<string, string | number | undefined>;
}

export interface FormTask {
    id: string;
    name: string;
    // 步骤组页面地址，对应 YAML 任务上的 url；相同地址会复用已打开的页面
    url?: string;
    steps: FormStep[];
}

export type FormTarget =
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

export interface FormScript {
    target: FormTarget;
    tasks: FormTask[];
}

export interface ActionField {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    placeholder?: string;
    options?: { label: string; value: string }[];
    optional?: boolean;
}

// 表单支持的动作清单：下拉选项、参数表单、YAML 生成都以这份元数据为准
export const ACTION_OPTIONS: {
    action: string;
    label: string;
    fields: ActionField[];
    platforms?: FormTarget['type'][];
}[] = [
    {
        action: 'launch',
        label: '打开 App',
        platforms: ['android'],
        fields: [
            {
                key: 'target',
                label: 'App 名称或包名',
                placeholder: '如：ctest 或 com.example.app',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiTap',
        label: '点击',
        fields: [
            {
                key: 'locate',
                label: '点击什么',
                placeholder: '如：登录按钮',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiInput',
        label: '输入',
        fields: [
            {
                key: 'locate',
                label: '在哪个输入框',
                placeholder: '如：用户名输入框',
                type: 'text',
            },
            {
                key: 'value',
                label: '输入内容',
                placeholder: '如：{{USERNAME}}',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiAssert',
        label: '断言验证',
        fields: [
            {
                key: 'prompt',
                label: '验证什么',
                placeholder: '如：页面显示登录成功',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiWaitFor',
        label: '等待出现',
        fields: [
            {
                key: 'prompt',
                label: '等待什么出现',
                placeholder: '如：页面跳转到首页',
                type: 'text',
            },
            {
                key: 'timeout',
                label: '超时(毫秒)',
                placeholder: '15000',
                type: 'number',
                optional: true,
            },
        ],
    },
    {
        action: 'ai',
        label: '自由指令',
        fields: [
            {
                key: 'prompt',
                label: '让 AI 做什么',
                placeholder: '如：关闭所有弹窗',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiHover',
        label: '悬停',
        platforms: ['web'],
        fields: [
            {
                key: 'locate',
                label: '悬停在哪里',
                placeholder: '如：更多菜单',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiRightClick',
        label: '右键点击',
        platforms: ['web'],
        fields: [
            {
                key: 'locate',
                label: '右键点击什么',
                placeholder: '如：文件图标',
                type: 'text',
            },
        ],
    },
    {
        action: 'aiKeyboardPress',
        label: '按键',
        fields: [
            {
                key: 'key',
                label: '按哪个键',
                type: 'select',
                options: [
                    'Enter',
                    'Tab',
                    'Escape',
                    'Backspace',
                    'ArrowUp',
                    'ArrowDown',
                    'ArrowLeft',
                    'ArrowRight',
                ].map((key) => ({
                    label: key,
                    value: key,
                })),
            },
        ],
    },
    {
        action: 'aiScroll',
        label: '滚动页面',
        fields: [
            {
                key: 'direction',
                label: '方向',
                type: 'select',
                options: [
                    { label: '向下', value: 'down' },
                    { label: '向上', value: 'up' },
                    { label: '向左', value: 'left' },
                    { label: '向右', value: 'right' },
                ],
            },
            {
                key: 'distance',
                label: '距离(像素)',
                placeholder: '留空自动',
                type: 'number',
                optional: true,
            },
        ],
    },
    {
        action: 'aiQuery',
        label: '提取数据',
        fields: [
            {
                key: 'prompt',
                label: '提取什么',
                placeholder: '如：{title: string} 页面标题',
                type: 'text',
            },
        ],
    },
    {
        action: 'sleep',
        label: '固定等待',
        fields: [{ key: 'ms', label: '等待毫秒数', placeholder: '1000', type: 'number' }],
    },
];

const SUPPORTED_FORM_ACTIONS = ACTION_OPTIONS.map((option) => option.action);

export function actionOptionsForTarget(targetType: FormTarget['type']) {
    return ACTION_OPTIONS.filter(
        (option) => !option.platforms || option.platforms.includes(targetType),
    );
}

export function createStepId() {
    return crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------- 表单 → YAML ----------

function yamlScrollBody(params: FormStep['params']) {
    const scroll: Record<string, unknown> = {
        direction: params.direction ?? 'down',
    };
    if (params.distance !== undefined && params.distance !== '') {
        scroll.distance = Number(params.distance);
    }
    return { aiScroll: scroll };
}

function yamlWaitForBody(params: FormStep['params']) {
    const body: Record<string, unknown> = { aiWaitFor: params.prompt ?? '' };
    if (params.timeout !== undefined && params.timeout !== '') {
        body.timeout = Number(params.timeout);
    }
    return body;
}

function yamlActionBody(step: FormStep) {
    const builders: Record<string, (params: FormStep['params']) => Record<string, unknown>> = {
        launch: (params) => ({ launch: params.target ?? '' }),
        aiInput: (params) => ({
            aiInput: { locate: params.locate ?? '', value: params.value ?? '' },
        }),
        aiScroll: yamlScrollBody,
        sleep: (params) => ({ sleep: Number(params.ms ?? 0) }),
        aiWaitFor: yamlWaitForBody,
        aiTap: (params) => ({ aiTap: params.locate ?? '' }),
        aiHover: (params) => ({ aiHover: params.locate ?? '' }),
        aiRightClick: (params) => ({ aiRightClick: params.locate ?? '' }),
        aiKeyboardPress: (params) => ({ aiKeyboardPress: params.key ?? 'Enter' }),
    };
    const build = builders[step.action];
    return build ? build(step.params) : { [step.action]: step.params.prompt ?? '' };
}

function stepToYamlObject(step: FormStep) {
    const body = yamlActionBody(step);
    if (step.name && step.name.trim() !== '') {
        body.name = step.name.trim();
    }
    return body;
}

export function formToYaml(form: FormScript) {
    const doc: Record<string, unknown> = {};
    if (form.target.type === 'web') {
        doc.target = form.target.url;
        if (form.target.viewportWidth !== undefined) {
            doc.viewportWidth = form.target.viewportWidth;
        }
        if (form.target.viewportHeight !== undefined) {
            doc.viewportHeight = form.target.viewportHeight;
        }
    } else {
        doc.android = { deviceId: form.target.deviceId };
    }
    doc.tasks = form.tasks.map((task) => {
        const item: Record<string, unknown> = { name: task.name };
        if (form.target.type === 'web' && task.url && task.url.trim() !== '') {
            item.url = task.url.trim();
        }
        item.flow = task.steps.map(stepToYamlObject);
        return item;
    });
    return stringify(doc);
}

// ---------- YAML → 表单 ----------

export type YamlToFormResult = { ok: true; form: FormScript } | { ok: false };

// 把 YAML 步骤解析为表单步骤，遇到表单无法表达的内容返回 null
function asText(value: unknown) {
    return typeof value === 'string' ? value : null;
}

function makeFormStep(
    action: string,
    name: string | undefined,
    params: FormStep['params'],
): FormStep {
    return { id: createStepId(), action, name, params };
}

function keyboardKey(raw: unknown) {
    if (typeof raw === 'string') {
        return raw;
    }
    if (isRecord(raw) && typeof raw.key === 'string') {
        return raw.key;
    }
    return null;
}

function yamlInputParams(raw: unknown) {
    if (!isRecord(raw) || typeof raw.locate !== 'string') {
        return null;
    }
    if (typeof raw.value !== 'string' && typeof raw.value !== 'number') {
        return null;
    }
    return { locate: raw.locate, value: String(raw.value) };
}

function yamlScrollParams(raw: unknown) {
    if (!isRecord(raw) || !['up', 'down', 'left', 'right'].includes(String(raw.direction))) {
        return null;
    }
    const params: FormStep['params'] = { direction: String(raw.direction) };
    if (typeof raw.distance === 'number') {
        params.distance = raw.distance;
    }
    return params;
}

function yamlPromptParams(action: string, raw: unknown, timeout: number | undefined) {
    const prompt = asText(raw);
    if (prompt === null) {
        return null;
    }
    const params: FormStep['params'] = { prompt };
    if (action === 'aiWaitFor' && timeout !== undefined) {
        params.timeout = timeout;
    }
    return params;
}

function yamlLocateParams(raw: unknown) {
    const locate = asText(raw);
    return locate === null ? null : { locate };
}

function yamlStepParams(action: string, raw: unknown, timeout: number | undefined) {
    const parsers: Record<string, () => FormStep['params'] | null> = {
        launch: () => {
            const target = asText(raw);
            return target === null ? null : { target };
        },
        ai: () => yamlPromptParams(action, raw, timeout),
        aiAssert: () => yamlPromptParams(action, raw, timeout),
        aiQuery: () => yamlPromptParams(action, raw, timeout),
        aiWaitFor: () => yamlPromptParams(action, raw, timeout),
        aiTap: () => yamlLocateParams(raw),
        aiHover: () => yamlLocateParams(raw),
        aiRightClick: () => yamlLocateParams(raw),
        aiKeyboardPress: () => {
            const key = keyboardKey(raw);
            return key === null ? null : { key };
        },
        aiInput: () => yamlInputParams(raw),
        aiScroll: () => yamlScrollParams(raw),
        sleep: () => (typeof raw === 'number' ? { ms: raw } : null),
    };
    const parseParams = parsers[action];
    if (!parseParams) {
        return null;
    }
    return parseParams();
}

function androidDeviceId(android: unknown) {
    if (!isRecord(android) || typeof android.deviceId !== 'string' || android.deviceId === '') {
        return null;
    }
    return android.deviceId;
}

function parseFormTarget(doc: Record<string, unknown>): FormTarget | null {
    const hasWebTarget = typeof doc.target === 'string';
    const hasAndroidTarget = isRecord(doc.android);
    if (hasWebTarget === hasAndroidTarget) {
        return null;
    }
    if (hasWebTarget) {
        return {
            type: 'web',
            url: String(doc.target),
            viewportWidth: optionalNumber(doc.viewportWidth),
            viewportHeight: optionalNumber(doc.viewportHeight),
        };
    }
    const deviceId = androidDeviceId(doc.android);
    if (!deviceId) {
        return null;
    }
    return { type: 'android', deviceId };
}

function optionalString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown) {
    return typeof value === 'number' ? value : undefined;
}

function optionalTrimmed(value: unknown) {
    if (typeof value !== 'string' || value.trim() === '') {
        return undefined;
    }
    return value.trim();
}

function parseFormSteps(flow: unknown[], targetType: FormTarget['type']) {
    const steps: FormStep[] = [];
    for (const step of flow) {
        const formStep = yamlStepToForm(step, targetType);
        if (!formStep) {
            return null;
        }
        steps.push(formStep);
    }
    return steps;
}

function parseFormTask(task: unknown, targetType: FormTarget['type']): FormTask | null {
    if (!isRecord(task) || typeof task.name !== 'string' || !Array.isArray(task.flow)) {
        return null;
    }
    const steps = parseFormSteps(task.flow, targetType);
    if (!steps) {
        return null;
    }
    return { id: createStepId(), name: task.name, url: optionalTrimmed(task.url), steps };
}

function stepActionKeys(step: Record<string, unknown>) {
    return Object.keys(step).filter((key) => key !== 'name' && key !== 'timeout');
}

function actionAllowedOnTarget(action: string, targetType: FormTarget['type']) {
    const option = ACTION_OPTIONS.find((item) => item.action === action);
    if (!option?.platforms) {
        return true;
    }
    return option.platforms.includes(targetType);
}

function yamlStepToForm(step: unknown, targetType: FormTarget['type']): FormStep | null {
    if (!isRecord(step)) {
        return null;
    }
    const actionKeys = stepActionKeys(step);
    if (actionKeys.length !== 1 || !SUPPORTED_FORM_ACTIONS.includes(actionKeys[0])) {
        return null;
    }
    const action = actionKeys[0];
    if (!actionAllowedOnTarget(action, targetType)) {
        return null;
    }
    const params = yamlStepParams(action, step[action], optionalNumber(step.timeout));
    if (!params) {
        return null;
    }
    return makeFormStep(action, optionalString(step.name), params);
}

function parseYamlDoc(yamlText: string) {
    try {
        return parse(yamlText);
    } catch {
        return null;
    }
}

function parseFormTasks(tasks: unknown[], targetType: FormTarget['type']) {
    const result: FormTask[] = [];
    for (const task of tasks) {
        const parsed = parseFormTask(task, targetType);
        if (!parsed) {
            return null;
        }
        result.push(parsed);
    }
    return result;
}

export function yamlToForm(yamlText: string): YamlToFormResult {
    const doc = parseYamlDoc(yamlText);
    if (!isRecord(doc) || !Array.isArray(doc.tasks) || doc.tasks.length === 0) {
        return { ok: false };
    }
    const target = parseFormTarget(doc);
    if (!target) {
        return { ok: false };
    }
    const tasks = parseFormTasks(doc.tasks, target.type);
    if (!tasks) {
        return { ok: false };
    }
    return { ok: true, form: { target, tasks } };
}
