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
  flow: FlowStep[];
}

export interface ParsedScript {
  target: string;
  viewportWidth?: number;
  viewportHeight?: number;
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

function validateStep(index: number, step: unknown, errors: string[]) {
  const prefix = `第 ${index + 1} 步`;
  if (!isRecord(step)) {
    errors.push(`${prefix}：步骤必须是一个动作对象`);
    return;
  }
  const keys = Object.keys(step);
  const actionKeys = keys.filter((key) => key !== 'name' && key !== 'timeout');
  if (actionKeys.length !== 1) {
    errors.push(`${prefix}：一个步骤只能写一个动作，当前写了 ${actionKeys.length} 个（${actionKeys.join('、')}）`);
    return;
  }
  const action = actionKeys[0];
  if (!(SUPPORTED_ACTIONS as readonly string[]).includes(action)) {
    errors.push(`${prefix}：不支持的动作 "${action}"，支持：${SUPPORTED_ACTIONS.join('、')}`);
    return;
  }
  if ('timeout' in step && action !== 'aiWaitFor') {
    errors.push(`${prefix}：timeout 只能用于 aiWaitFor 步骤`);
  }
  if ('timeout' in step && (typeof step.timeout !== 'number' || (step.timeout as number) <= 0)) {
    errors.push(`${prefix}：timeout 必须是正数毫秒`);
  }
  if ('name' in step && typeof step.name !== 'string') {
    errors.push(`${prefix}：name 必须是字符串`);
  }
  const params = step[action];
  if (action === 'aiInput') {
    if (!isRecord(params) || typeof params.locate !== 'string' || params.locate === '') {
      errors.push(`${prefix}（aiInput）：需要 locate 字段描述输入框位置`);
    }
    if (!isRecord(params) || params.value === undefined || params.value === null) {
      errors.push(`${prefix}（aiInput）：需要 value 字段填写输入内容`);
    }
    return;
  }
  if (action === 'sleep') {
    if (typeof params !== 'number' || params <= 0) {
      errors.push(`${prefix}（sleep）：等待毫秒数必须是正数`);
    }
    return;
  }
  if (action === 'aiScroll') {
    if (!isRecord(params) || !['up', 'down', 'left', 'right'].includes(String(params.direction))) {
      errors.push(`${prefix}（aiScroll）：direction 必须是 up/down/left/right 之一`);
    }
    return;
  }
  if (params === undefined || params === null || params === '') {
    errors.push(`${prefix}（${action}）：缺少指令内容`);
  }
}

export function parseScript(yamlText: string, variables: Record<string, string>): ParseResult {
  const errors: string[] = [];

  const unresolved = new Set<string>();
  for (const match of yamlText.matchAll(VARIABLE_PATTERN)) {
    if (!(match[1] in variables)) {
      unresolved.add(match[1]);
    }
  }
  if (unresolved.size > 0) {
    errors.push(`存在未定义的变量：${[...unresolved].join('、')}（请先在「设置-变量」里配置）`);
  }

  let doc: unknown;
  try {
    doc = parseDocument(substituteVariables(yamlText, variables)).toJS();
  } catch (error) {
    errors.push(`YAML 语法错误：${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    return { ok: false, errors };
  }

  if (!isRecord(doc)) {
    errors.push('脚本内容必须是一个 YAML 对象');
    return { ok: false, errors };
  }

  if (typeof doc.target !== 'string' || doc.target === '') {
    errors.push('缺少 target 字段（被测页面地址）');
  } else if (!/^https?:\/\//.test(doc.target)) {
    errors.push(`target 必须是 http(s) 地址，当前是：${doc.target}`);
  }

  if (doc.viewportWidth !== undefined && typeof doc.viewportWidth !== 'number') {
    errors.push('viewportWidth 必须是数字');
  }
  if (doc.viewportHeight !== undefined && typeof doc.viewportHeight !== 'number') {
    errors.push('viewportHeight 必须是数字');
  }

  const script: ParsedScript = {
    target: String(doc.target ?? ''),
    viewportWidth: typeof doc.viewportWidth === 'number' ? doc.viewportWidth : undefined,
    viewportHeight: typeof doc.viewportHeight === 'number' ? doc.viewportHeight : undefined,
    tasks: [],
  };

  if (!Array.isArray(doc.tasks) || doc.tasks.length === 0) {
    errors.push('tasks 必须是非空数组');
    return { ok: false, errors };
  }

  doc.tasks.forEach((task: unknown, taskIndex: number) => {
    const taskPrefix = `任务 ${taskIndex + 1}`;
    if (!isRecord(task)) {
      errors.push(`${taskPrefix}：必须是对象`);
      return;
    }
    if (typeof task.name !== 'string' || task.name === '') {
      errors.push(`${taskPrefix}：缺少 name 字段（步骤组名称）`);
    }
    if (!Array.isArray(task.flow) || task.flow.length === 0) {
      errors.push(`${taskPrefix}：flow 必须是非空数组`);
      return;
    }
    const flow: FlowStep[] = [];
    task.flow.forEach((step: unknown, stepIndex: number) => {
      validateStep(stepIndex, step, errors);
      if (isRecord(step)) {
        const actionKeys = Object.keys(step).filter((key) => key !== 'name' && key !== 'timeout');
        const action = actionKeys[0];
        flow.push({
          action,
          params: step[action],
          aux: {
            name: typeof step.name === 'string' ? step.name : undefined,
            timeout: typeof step.timeout === 'number' ? step.timeout : undefined,
          },
        });
      }
    });
    script.tasks.push({ name: String(task.name ?? ''), flow });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, script };
}
