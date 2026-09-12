import { describe, expect, test } from 'bun:test';
import { scriptValidationBanner } from '../src/pages/task-edit/script-validation';

describe('scriptValidationBanner', () => {
    test('尚未校验时不显示通过', () => {
        expect(scriptValidationBanner({ validated: false, errors: [] })).toBe('pending');
    });

    test('校验失败时显示错误', () => {
        expect(
            scriptValidationBanner({
                validated: true,
                errors: ['缺少 target 字段（被测页面地址）'],
            }),
        ).toBe('error');
    });

    test('校验完成且无错误时显示通过', () => {
        expect(scriptValidationBanner({ validated: true, errors: [] })).toBe('success');
    });
});
