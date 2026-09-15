import { describe, expect, test } from 'bun:test';
import { adbFailureMessage, assertAdbSuccess } from '@server/services/android-service';

describe('adb 结果', () => {
    test('失败信息优先用 stderr', () => {
        expect(adbFailureMessage(' err ', ' out ')).toBe('err');
        expect(adbFailureMessage('  ', ' out ')).toBe('out');
        expect(adbFailureMessage('  ', '  ')).toBe('ADB 命令执行失败');
    });

    test('退出码非 0 抛错', () => {
        expect(() => assertAdbSuccess({ exitCode: 1, stdout: '', stderr: 'bad' })).toThrow('bad');
        expect(assertAdbSuccess({ exitCode: 0, stdout: 'ok', stderr: '' })).toBe('ok');
    });
});
