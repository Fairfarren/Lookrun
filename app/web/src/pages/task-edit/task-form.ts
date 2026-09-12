import {
    actionOptionsForTarget,
    createStepId,
    formToYaml,
    yamlToForm,
    type FormScript,
    type FormStep,
    type FormTask,
} from '@lookrun/shared';

export function defaultStepParams(action: string) {
    if (action === 'aiScroll') {
        return { direction: 'down' };
    }
    if (action === 'aiKeyboardPress') {
        return { key: 'Enter' };
    }
    return {};
}

export function createEmptyStep(action: string) {
    return {
        id: createStepId(),
        action,
        params: defaultStepParams(action),
    };
}

export function createEmptyTask(index: number): FormTask {
    return {
        id: createStepId(),
        name: `步骤组 ${index}`,
        steps: [createEmptyStep('aiTap')],
    };
}

export function taskEditTitle(isNew: boolean) {
    if (isNew) {
        return '新建任务';
    }
    return '编辑任务';
}

export function isNewEditRoute(id: string | undefined) {
    if (id === undefined) {
        return true;
    }
    return id === 'new';
}

export function createEmptyForm(): FormScript {
    return { target: { type: 'web', url: '' }, tasks: [createEmptyTask(1)] };
}

export function editorModeSwitch(input: {
    current: 'form' | 'yaml';
    next: string | number;
    form: FormScript;
    yamlText: string;
}) {
    if (input.next === input.current) {
        return { type: 'noop' as const };
    }
    if (input.next === 'yaml') {
        return { type: 'yaml' as const, yamlText: formToYaml(input.form) };
    }
    const parsed = yamlToForm(input.yamlText);
    if (parsed.ok) {
        return { type: 'form' as const, form: parsed.form };
    }
    return { type: 'blocked' as const };
}

export function taskNameError(name: string) {
    if (!name.trim()) {
        return '请填写任务名';
    }
    return null;
}

export function yamlValidateError(result: { ok: boolean }) {
    if (!result.ok) {
        return '脚本校验未通过，请先修复错误';
    }
    return null;
}

export function withDefaultAndroidDevice(form: FormScript, deviceId: string) {
    if (form.target.type !== 'android') {
        return form;
    }
    if (form.target.deviceId) {
        return form;
    }
    return {
        ...form,
        target: { type: 'android' as const, deviceId },
    };
}

export function canCheckAndroidDevice(form: FormScript) {
    if (form.target.type !== 'android') {
        return false;
    }
    if (!form.target.deviceId) {
        return false;
    }
    return true;
}

export function firstDeviceId(devices: { id: string }[]) {
    if (!devices[0]) {
        return '';
    }
    return devices[0].id;
}

export function androidDeviceId(form: FormScript) {
    if (form.target.type !== 'android') {
        return '';
    }
    return form.target.deviceId;
}

export function isAndroidLaunchField(input: {
    action: string;
    fieldKey: string;
    targetType: string;
}) {
    if (input.action !== 'launch') {
        return false;
    }
    if (input.fieldKey !== 'target') {
        return false;
    }
    return input.targetType === 'android';
}

export function stepFieldKind(fieldType: string, androidLaunch: boolean) {
    if (fieldType === 'select') {
        return 'select';
    }
    if (androidLaunch) {
        return 'android-launch';
    }
    if (fieldType === 'number') {
        return 'number';
    }
    return 'text';
}

export function currentYamlText(input: {
    mode: 'form' | 'yaml';
    form: FormScript;
    yamlText: string;
}) {
    if (input.mode === 'form') {
        return formToYaml(input.form);
    }
    return input.yamlText;
}

export function applyLoadedTaskYaml(yamlText: string) {
    const parsed = yamlToForm(yamlText);
    if (parsed.ok) {
        return { form: parsed.form, yamlLocked: false, mode: 'form' as const };
    }
    return { form: null, yamlLocked: true, mode: 'yaml' as const };
}

export function targetFromSegment(value: string) {
    if (value === 'android') {
        return { type: 'android' as const, deviceId: '' };
    }
    return { type: 'web' as const, url: '' };
}

export function stepsForTargetType(steps: FormStep[], targetType: 'web' | 'android') {
    return steps.map((step) => {
        if (actionOptionsForTarget(targetType).some((option) => option.action === step.action)) {
            return step;
        }
        return createEmptyStep('aiTap');
    });
}

export function formWithTargetType(form: FormScript, targetType: 'web' | 'android') {
    return {
        ...form,
        target: targetFromSegment(targetType),
        tasks: form.tasks.map((task) => ({
            ...task,
            steps: stepsForTargetType(task.steps, targetType),
        })),
    };
}

export function fieldStringValue(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }
    return '';
}

export function fieldSelectValue(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }
    return undefined;
}

export function urlText(url: string | undefined) {
    return url ?? '';
}

export function withWebUrl(form: FormScript, url: string) {
    if (form.target.type !== 'web') {
        return form;
    }
    return { ...form, target: { ...form.target, url } };
}

export function withWebViewportWidth(form: FormScript, viewportWidth: number | undefined) {
    if (form.target.type !== 'web') {
        return form;
    }
    return { ...form, target: { ...form.target, viewportWidth } };
}

export function withWebViewportHeight(form: FormScript, viewportHeight: number | undefined) {
    if (form.target.type !== 'web') {
        return form;
    }
    return { ...form, target: { ...form.target, viewportHeight } };
}

export function optionalDeviceId(deviceId: string) {
    if (!deviceId) {
        return undefined;
    }
    return deviceId;
}

export function fieldNumberValue(value: unknown) {
    if (typeof value === 'number') {
        return value;
    }
    return undefined;
}
