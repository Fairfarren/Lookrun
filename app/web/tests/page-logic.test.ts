import { describe, expect, test } from 'bun:test';
import { errorText } from '../src/utils/error-text';
import { formatBytes } from '../src/utils/format-bytes';
import { selectedMenuKey, themeFromSwitch, themeSwitchTitle } from '../src/utils/menu-key';
import { draggingItemStyle } from '../src/utils/sortable-style';
import {
    androidDeviceId,
    applyLoadedTaskYaml,
    canCheckAndroidDevice,
    createEmptyStep,
    currentYamlText,
    defaultStepParams,
    editorModeSwitch,
    fieldNumberValue,
    fieldSelectValue,
    fieldStringValue,
    firstDeviceId,
    formWithTargetType,
    isAndroidLaunchField,
    isNewEditRoute,
    optionalDeviceId,
    stepFieldKind,
    taskNameError,
    urlText,
    withDefaultAndroidDevice,
    yamlValidateError,
} from '../src/utils/task-form';
import {
    applyRunWsMessage,
    queueAddMissing,
    queueCardTitle,
    startRunSuccessText,
    stepLogPlaceholder,
    type RunViewState,
} from '../src/utils/run-ws';
import {
    createQueueThenSaveItems,
    isNewQueueRoute,
    queueEditTitle,
    queueSaveItemsError,
    queueSaveNameError,
    validQueueItems,
} from '../src/utils/queue-edit';
import type { QueueItem } from '../src/api';
import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { hasTokenUsage, stepStatusTag, tokenPairText } from '../src/utils/run-detail';
import { canStartTask, startTaskSuccess } from '../src/utils/tasks-run';
import { queuesViewState, startQueueFeedback } from '../src/utils/queues-page';
import {
    checkAlertType,
    checkResultFromError,
    defaultModelId,
    emptyVariableName,
    variablesToRecord,
} from '../src/utils/settings-view';

const emptyView = (): RunViewState => ({
    frame: null,
    queueItems: [],
    steps: [],
    current: { status: 'idle', run: null },
    finishedStatus: null,
});

function pendingQueueItem(): QueueItem {
    return {
        id: 1,
        taskId: 2,
        taskName: 't',
        modelId: 'm',
        model: 'm',
        status: 'pending',
        position: 0,
        runId: null,
        createdAt: 't',
    };
}

function sampleRun(status: RunRecord['status']): RunRecord {
    return {
        id: 9,
        taskId: 1,
        taskName: '登录',
        model: 'm',
        status,
        error: null,
        startedAt: 't',
        finishedAt: status === 'running' ? null : 't2',
        durationMs: status === 'running' ? null : 1,
        tokenInput: 0,
        tokenOutput: 0,
    };
}

function sampleStep(status: RunStepRecord['status']): RunStepRecord {
    return {
        id: 1,
        runId: 9,
        stepIndex: 0,
        stepName: '点击',
        action: 'aiTap',
        url: null,
        prompt: null,
        aiResult: null,
        shotBefore: null,
        shotAfter: null,
        durationMs: 1,
        tokenInput: 0,
        tokenOutput: 0,
        status,
        error: null,
        createdAt: 't',
    };
}

describe('页面逻辑', () => {
    test('错误文案和字节', () => {
        expect(errorText(new Error('e'))).toBe('e');
        expect(errorText(1)).toBe('1');
        expect(formatBytes(500)).toBe('500 B');
        expect(formatBytes(2048)).toBe('2 KB');
        expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    test('菜单和主题', () => {
        expect(selectedMenuKey('/run/x')).toBe('/run');
        expect(selectedMenuKey('/unknown')).toBe('/tasks');
        expect(themeSwitchTitle('dark')).toBe('切换到亮色模式');
        expect(themeSwitchTitle('light')).toBe('切换到黑夜模式');
        expect(themeFromSwitch(true)).toBe('dark');
        expect(themeFromSwitch(false)).toBe('light');
    });

    test('拖拽样式', () => {
        expect(draggingItemStyle(true).opacity).toBe(0.5);
        expect(draggingItemStyle(false).cursor).toBe('grab');
    });

    test('任务表单', () => {
        expect(defaultStepParams('aiScroll')).toEqual({ direction: 'down' });
        expect(defaultStepParams('aiKeyboardPress')).toEqual({ key: 'Enter' });
        expect(defaultStepParams('aiTap')).toEqual({});
        expect(createEmptyStep('aiTap').action).toBe('aiTap');
        expect(isNewEditRoute(undefined)).toBe(true);
        expect(isNewEditRoute('new')).toBe(true);
        expect(isNewEditRoute('1')).toBe(false);
        expect(taskNameError(' ')).toBe('请填写任务名');
        expect(yamlValidateError({ ok: false })).toContain('校验');
        expect(yamlValidateError({ ok: true })).toBeNull();
        expect(firstDeviceId([])).toBe('');
        expect(firstDeviceId([{ id: 'd' }])).toBe('d');
        expect(optionalDeviceId('')).toBeUndefined();
        expect(optionalDeviceId('d')).toBe('d');
        expect(urlText(undefined)).toBe('');
        expect(fieldStringValue(1)).toBe('');
        expect(fieldSelectValue('a')).toBe('a');
        expect(fieldNumberValue(3)).toBe(3);
        expect(stepFieldKind('select', false)).toBe('select');
        expect(stepFieldKind('text', true)).toBe('android-launch');
        expect(stepFieldKind('number', false)).toBe('number');
        expect(stepFieldKind('text', false)).toBe('text');
        expect(
            isAndroidLaunchField({ action: 'launch', fieldKey: 'target', targetType: 'android' }),
        ).toBe(true);
        expect(
            isAndroidLaunchField({ action: 'aiTap', fieldKey: 'target', targetType: 'android' }),
        ).toBe(false);
        const form = {
            target: { type: 'android' as const, deviceId: '' },
            tasks: [{ id: 't', name: 'a', steps: [createEmptyStep('aiTap')] }],
        };
        expect(androidDeviceId(form)).toBe('');
        expect(canCheckAndroidDevice(form)).toBe(false);
        expect(withDefaultAndroidDevice(form, 'dev').target).toEqual({
            type: 'android',
            deviceId: 'dev',
        });
        expect(formWithTargetType(form, 'web').target.type).toBe('web');
        expect(editorModeSwitch({ current: 'form', next: 'form', form, yamlText: '' }).type).toBe(
            'noop',
        );
        expect(editorModeSwitch({ current: 'form', next: 'yaml', form, yamlText: '' }).type).toBe(
            'yaml',
        );
        expect(applyLoadedTaskYaml('not-yaml').mode).toBe('yaml');
        expect(currentYamlText({ mode: 'yaml', form, yamlText: 'a' })).toBe('a');
    });

    test('运行页 websocket', () => {
        const frame = applyRunWsMessage(emptyView(), { type: 'frame', data: 'x' });
        expect(frame.frame).toBe('x');
        const queued = applyRunWsMessage(frame, { type: 'queue', items: [] });
        expect(queued.queueItems).toEqual([]);
        const started = applyRunWsMessage(queued, {
            type: 'step-start',
            runId: 1,
            stepIndex: 0,
            stepName: 'a',
            action: 'aiTap',
            totalSteps: 1,
        });
        expect(started.steps[0]?.status).toBe('running');
        expect(queueAddMissing(undefined, 'm')).toBe(true);
        expect(queueAddMissing(1, undefined)).toBe(true);
        expect(queueAddMissing(1, 'm')).toBe(false);
        expect(startRunSuccessText(true)).toBe('已加入队列');
        expect(queueCardTitle(2)).toContain('2');
        expect(stepLogPlaceholder(true)).toBe('准备中...');
        expect(stepLogPlaceholder(false)).toBe('暂无步骤');
    });

    test('frame 后再 queue 仍保留 frame', () => {
        const withFrame = applyRunWsMessage(emptyView(), { type: 'frame', data: 'x' });
        const queued = applyRunWsMessage(withFrame, {
            type: 'queue',
            items: [pendingQueueItem()],
        });
        expect(queued.frame).toBe('x');
        expect(queued.queueItems).toHaveLength(1);
    });

    test('run running 写入 current 并清空 steps', () => {
        const started = applyRunWsMessage(
            {
                ...emptyView(),
                frame: 'x',
                steps: [
                    {
                        stepIndex: 0,
                        stepName: '旧',
                        action: 'aiTap',
                        status: 'success',
                    },
                ],
            },
            { type: 'run', run: sampleRun('running') },
        );
        expect(started.current.status).toBe('running');
        expect(started.current.run?.runId).toBe(9);
        expect(started.current.run?.currentStepIndex).toBe(-1);
        expect(started.steps).toEqual([]);
        expect(started.frame).toBe('x');
        expect(started.finishedStatus).toBeNull();
    });

    test('step-start 在 running 时更新 currentStepIndex', () => {
        const running = applyRunWsMessage(emptyView(), {
            type: 'run',
            run: sampleRun('running'),
        });
        const started = applyRunWsMessage(running, {
            type: 'step-start',
            runId: 9,
            stepIndex: 2,
            stepName: '点击',
            action: 'aiTap',
            totalSteps: 4,
        });
        expect(started.current.status).toBe('running');
        expect(started.current.run?.currentStepIndex).toBe(2);
        expect(started.current.run?.totalSteps).toBe(4);
        expect(started.steps[0]?.status).toBe('running');
    });

    test('step 回写 status 和 record', () => {
        const running = applyRunWsMessage(emptyView(), {
            type: 'run',
            run: sampleRun('running'),
        });
        const started = applyRunWsMessage(running, {
            type: 'step-start',
            runId: 9,
            stepIndex: 0,
            stepName: '点击',
            action: 'aiTap',
            totalSteps: 1,
        });
        const record = sampleStep('success');
        const updated = applyRunWsMessage(started, { type: 'step', step: record });
        expect(updated.steps[0]?.status).toBe('success');
        expect(updated.steps[0]?.record).toEqual(record);
        expect(updated.current.status).toBe('running');
    });

    test('run 结束变为 idle 并保留 frame 与 steps', () => {
        const withFrame = applyRunWsMessage(emptyView(), { type: 'frame', data: 'x' });
        const running = applyRunWsMessage(withFrame, {
            type: 'run',
            run: sampleRun('running'),
        });
        const started = applyRunWsMessage(running, {
            type: 'step-start',
            runId: 9,
            stepIndex: 0,
            stepName: '点击',
            action: 'aiTap',
            totalSteps: 1,
        });
        const finished = applyRunWsMessage(started, {
            type: 'run',
            run: sampleRun('success'),
        });
        expect(finished.current.status).toBe('idle');
        expect(finished.current.run).toBeNull();
        expect(finished.finishedStatus).toBe('success');
        expect(finished.frame).toBe('x');
        expect(finished.steps).toHaveLength(1);
    });

    test('新建队列用创建结果的 id 更新条目', async () => {
        const payload = { name: 'q', items: [{ taskId: 1, modelId: 'm' }] };
        const updated: { id: number; payload: typeof payload }[] = [];
        await createQueueThenSaveItems({
            payload,
            create: async () => ({ id: 7 }),
            update: async (id, next) => {
                updated.push({ id, payload: next });
            },
        });
        expect(updated).toEqual([{ id: 7, payload }]);
    });

    test('队列与任务页', () => {
        expect(isNewQueueRoute(undefined)).toBe(true);
        expect(queueEditTitle(true)).toBe('新建队列');
        expect(queueSaveNameError(' ')).toBe('请填写队列名');
        expect(queueSaveItemsError(0)).toBe('至少添加一个任务');
        expect(validQueueItems([{ id: '1', taskId: 1, modelId: undefined }])).toEqual([]);
        expect(validQueueItems([{ id: '1', taskId: 1, modelId: 'm' }])).toHaveLength(1);
        expect(canStartTask(1, 'm')).toBe(true);
        expect(canStartTask(undefined, 'm')).toBe(false);
        expect(startTaskSuccess(true).stay).toBe(true);
        expect(queuesViewState({ loading: true, count: 0 })).toBe('loading');
        expect(queuesViewState({ loading: false, count: 0 })).toBe('empty');
        expect(queuesViewState({ loading: false, count: 1 })).toBe('ready');
        expect(startQueueFeedback({ name: 'q', started: 1, queued: 0, errors: ['e'] }).type).toBe(
            'warning',
        );
        expect(startQueueFeedback({ name: 'q', started: 1, queued: 0, errors: [] }).type).toBe(
            'success',
        );
        expect(tokenPairText(0, 0)).toBe('-');
        expect(tokenPairText(1, 2)).toBe('1 / 2');
        expect(hasTokenUsage(1, 0)).toBe(true);
        expect(stepStatusTag('success').color).toBe('success');
        expect(stepStatusTag('failed').text).toBe('失败');
        expect(defaultModelId(null, 'a')).toBe('a');
        expect(emptyVariableName([{ key: ' ' }])).toBe(true);
        expect(variablesToRecord([{ key: ' A ', value: '1' }])).toEqual({ A: '1' });
        expect(checkAlertType(true)).toBe('success');
        expect(checkResultFromError(new Error('e')).message).toBe('e');
    });
});
