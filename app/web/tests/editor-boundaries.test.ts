import { expect, test } from 'bun:test';
import type { FormScript } from '@lookrun/shared';
import {
    canCheckAndroidDevice,
    fieldSelectValue,
    formWithTargetType,
    isAndroidLaunchField,
    withDefaultAndroidDevice,
    withWebUrl,
    withWebViewportHeight,
    withWebViewportWidth,
} from '../src/pages/task-edit/task-form';
import { checkAlertType, checkResultFromError } from '../src/pages/settings/utils';

test('网页目标不会自动替换成 Android 设备，不能进行设备检查', () => {
    const form: FormScript = { target: { type: 'web', url: 'https://example.com' }, tasks: [] };

    expect({
        unchanged: withDefaultAndroidDevice(form, 'device') === form,
        canCheck: canCheckAndroidDevice(form),
    }).toEqual({ unchanged: true, canCheck: false });
});

test('网页编辑操作不会改写 Android 目标', () => {
    const form: FormScript = { target: { type: 'android', deviceId: 'device' }, tasks: [] };

    expect([
        withWebUrl(form, 'https://example.com'),
        withWebViewportWidth(form, 400),
        withWebViewportHeight(form, 900),
    ]).toEqual([form, form, form]);
});

test('切换到网页时替换 Android 专用启动动作，并保留通用动作', () => {
    const form: FormScript = {
        target: { type: 'android', deviceId: 'device' },
        tasks: [
            {
                id: 'g',
                name: '步骤组',
                steps: [
                    { id: 'launch', action: 'launch', params: { target: 'org.example.app' } },
                    { id: 'tap', action: 'aiTap', params: { locate: '按钮' } },
                ],
            },
        ],
    };

    const changed = formWithTargetType(form, 'web');

    expect({
        target: changed.target,
        actions: changed.tasks[0]!.steps.map((step) => step.action),
        retained: changed.tasks[0]!.steps[1],
    }).toEqual({
        target: { type: 'web', url: '' },
        actions: ['aiTap', 'aiTap'],
        retained: form.tasks[0]!.steps[1],
    });
});

test('启动动作的非目标字段不启用应用选择器，非法下拉值保持未选', () => {
    expect({
        android: isAndroidLaunchField({
            action: 'launch',
            fieldKey: 'other',
            targetType: 'android',
        }),
        selected: fieldSelectValue(123),
    }).toEqual({ android: false, selected: undefined });
});

test('模型检查非 Error 异常保留文本并使用错误类型', () => {
    expect({ result: checkResultFromError('服务拒绝'), type: checkAlertType(false) }).toEqual({
        result: { ok: false, message: '服务拒绝' },
        type: 'error',
    });
});
