import { expect, test } from 'bun:test';
import { confirmAction, setConfirmHandler } from '@/components/confirm';

test('未挂载确认框时调用会抛错', () => {
    setConfirmHandler(null);

    expect(() =>
        confirmAction({
            title: '删除？',
            description: '不可恢复',
            confirmLabel: '删除',
        }),
    ).toThrow('确认框尚未挂载');
});

test('已挂载时把请求交给处理器', async () => {
    setConfirmHandler(async (request) => request.confirmLabel === '删除');

    const ok = await confirmAction({
        title: '删除？',
        description: '不可恢复',
        confirmLabel: '删除',
        destructive: true,
    });

    expect(ok).toBe(true);
    setConfirmHandler(null);
});
