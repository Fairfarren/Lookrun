import { expect, test } from 'bun:test';
import { createAndroidService } from '../src/services/android-service';

type Io = Parameters<typeof createAndroidService>[0];
function setup(options: { missing?: boolean; failure?: boolean }) {
    const commands: string[][] = [];
    const waits: number[] = [];
    let page = 0;
    const io: Io = {
        detectAdbPath: () => (options.missing ? null : '/stub/adb'),
        getConnectedDevicesWithDetails: (async () => [
            { udid: 'device', model: 'Pixel' },
        ]) as Io['getConnectedDevicesWithDetails'],
        sleep: (async (ms: number) => {
            waits.push(ms);
        }) as Io['sleep'],
        spawn: ((args: string[]) => {
            commands.push(args);
            let output = '';
            if (args.includes('size')) output = 'Physical size: 100x200';
            if (args.includes('query-activities')) output = 'com.test.app/.MainActivity';
            if (args.includes('cat')) {
                output =
                    page++ === 0
                        ? '<hierarchy />'
                        : '<node text="应用" clickable="true" bounds="[10,20][30,40]" />';
            }
            return {
                exited: Promise.resolve(options.failure ? 1 : 0),
                stdout: new Response(output).body,
                stderr: new Response(options.failure ? '设备命令失败' : '').body,
            };
        }) as unknown as Io['spawn'],
    };
    return { service: createAndroidService(io), commands, waits };
}

test('设备服务返回设备与连接状态', async () => {
    const { service } = setup({});

    const devices = await service.listAndroidDevices();
    const checked = await service.checkAndroidDevice('device');

    expect({ devices, checked, adb: service.androidAdbPath() }).toEqual({
        devices: [{ id: 'device', name: 'Pixel' }],
        checked: { ok: true, device: { id: 'device', name: 'Pixel' } },
        adb: '/stub/adb',
    });
});

test('应用列表经ADB输出解析为包名', async () => {
    const { service } = setup({});

    expect(await service.listAndroidApps('device')).toEqual([{ packageName: 'com.test.app' }]);
});

test('ADB缺失时返回安装提示', async () => {
    const { service } = setup({ missing: true });

    await expect(service.listAndroidApps('device')).rejects.toThrow('未找到 ADB');
});

test('ADB命令失败时保留设备诊断', async () => {
    const { service } = setup({ failure: true });

    await expect(service.listAndroidApps('device')).rejects.toThrow('设备命令失败');
});

test('按显示名打开应用会翻页定位点击并等待界面稳定', async () => {
    const { service, commands, waits } = setup({});
    const launcher = service.createDeviceAndroidAppLauncher({
        deviceId: 'device',
        directLaunch: async () => {},
    });

    await launcher('应用');

    expect({
        tapped: commands.at(-1),
        sizes: commands.filter((args) => args.includes('size')).length,
        waits,
    }).toEqual({
        tapped: ['/stub/adb', '-s', 'device', 'shell', 'input', 'tap', '20', '30'],
        sizes: 1,
        waits: [500, 500, 400, 800],
    });
});
