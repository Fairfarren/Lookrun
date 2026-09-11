import { expect, test } from 'bun:test';
import { dispatchStep } from '../src/server/runner';

test('打开 App 步骤交给 Android Agent 执行', async () => {
    let launchedTarget = '';
    const androidAgentStub = {
        launch: async (target: string) => {
            launchedTarget = target;
        },
    };

    await dispatchStep(
        androidAgentStub as unknown as Parameters<typeof dispatchStep>[0],
        { action: 'launch', params: 'com.example.app' },
        0,
    );

    expect(launchedTarget).toBe('com.example.app');
});
