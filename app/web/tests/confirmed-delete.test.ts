import { expect, test } from 'bun:test';
import { runConfirmedDelete } from '@/utils/confirmed-delete';

test('未确认时不调用删除', async () => {
    let removed = false;

    await runConfirmedDelete({
        confirmed: false,
        remove: async () => {
            removed = true;
        },
        onSuccess: () => {},
        onError: () => {},
    });

    expect(removed).toBe(false);
});

test('确认后删除成功时走成功回调', async () => {
    const events: string[] = [];

    await runConfirmedDelete({
        confirmed: true,
        remove: async () => {
            events.push('removed');
        },
        onSuccess: () => events.push('success'),
        onError: (message) => events.push(message),
    });

    expect(events).toEqual(['removed', 'success']);
});

test('确认后删除失败时走错误回调', async () => {
    const events: string[] = [];

    await runConfirmedDelete({
        confirmed: true,
        remove: async () => {
            throw new Error('网络错误');
        },
        onSuccess: () => events.push('success'),
        onError: (message) => events.push(message),
    });

    expect(events).toEqual(['网络错误']);
});
