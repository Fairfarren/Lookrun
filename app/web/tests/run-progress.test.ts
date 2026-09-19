import { describe, expect, test } from 'bun:test';
import { runProgressText } from '../src/pages/run/utils';

describe('runProgressText', () => {
    test('总步数为 0 时显示准备中而不是 0/?', () => {
        const text = runProgressText({
            taskName: 'MOCK 冒烟',
            currentStepIndex: -1,
            totalSteps: 0,
        });

        expect(text).toBe('MOCK 冒烟（准备中）');
    });

    test('步序未开始时即使已有总数也显示准备中', () => {
        expect(
            runProgressText({
                taskName: 'MOCK 冒烟',
                currentStepIndex: -1,
                totalSteps: 4,
            }),
        ).toBe('MOCK 冒烟（准备中）');
    });

    test('开始执行后显示当前步和总步数', () => {
        expect(
            runProgressText({
                taskName: 'MOCK 冒烟',
                currentStepIndex: 0,
                totalSteps: 4,
            }),
        ).toBe('MOCK 冒烟（1/4）');
    });
});
