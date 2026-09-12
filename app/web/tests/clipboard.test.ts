import { expect, test } from 'bun:test';
import { copyWithNotify } from '../src/utils/clipboard';

test('复制成功时提示已复制', async () => {
    const messages: string[] = [];

    await copyWithNotify({
        text: 'hello',
        writeText: async () => {},
        onSuccess: (message) => messages.push(message),
        onError: (message) => messages.push(`error:${message}`),
    });

    expect(messages).toEqual(['已复制']);
});

test('复制失败时提示错误文案', async () => {
    const messages: string[] = [];

    await copyWithNotify({
        text: 'hello',
        writeText: async () => {
            throw new Error('权限被拒');
        },
        onSuccess: (message) => messages.push(message),
        onError: (message) => messages.push(message),
    });

    expect(messages).toEqual(['权限被拒']);
});
