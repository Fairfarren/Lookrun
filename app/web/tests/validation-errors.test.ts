import { expect, test } from 'bun:test';
import { createValidationErrorKey } from '@/pages/task-edit/validation-errors';

test('重复校验文案仍生成不同列表标识', () => {
    const error = '第 1 步（aiTap）：缺少指令内容';

    expect(createValidationErrorKey(error, 0)).not.toBe(createValidationErrorKey(error, 1));
});
