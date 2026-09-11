import { expect, test } from 'bun:test';

test('Android 服务模块可以在 Bun 运行时加载', async () => {
    const androidService = await import('../src/services/android-service');

    expect(typeof androidService.listAndroidDevices).toBe('function');
});
