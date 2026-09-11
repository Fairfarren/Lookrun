import { describe, expect, test } from 'bun:test';
import { parseScript, substituteVariables } from '../src/yamlflow';

describe('substituteVariables', () => {
    test('替换 {{变量}} 占位符', () => {
        const text = 'value: "{{USERNAME}} / {{PASSWORD}}"';
        expect(substituteVariables(text, { USERNAME: 'alice', PASSWORD: 's3cret' })).toBe(
            'value: "alice / s3cret"',
        );
    });

    test('变量不存在时保留原样，由解析阶段统一报错', () => {
        expect(substituteVariables('v: {{MISSING}}', {})).toBe('v: {{MISSING}}');
    });

    test('没有占位符时原样返回', () => {
        expect(substituteVariables('target: https://a.com', { A: '1' })).toBe(
            'target: https://a.com',
        );
    });
});

describe('parseScript', () => {
    const validYaml = `
target: https://example.com
tasks:
  - name: 登录
    flow:
      - aiInput:
          locate: 用户名输入框
          value: alice
      - aiInput:
          locate: 密码输入框
          value: "{{PASSWORD}}"
      - aiTap: 登录按钮
      - aiAssert: 页面出现欢迎语
  - name: 搜索
    flow:
      - ai: 在搜索框输入手机并点击搜索
      - sleep: 1000
`;

    test('解析合法脚本成功', () => {
        const result = parseScript(validYaml, { PASSWORD: 's3cret' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.script.target).toEqual({
            type: 'web',
            url: 'https://example.com',
            viewportWidth: undefined,
            viewportHeight: undefined,
        });
        expect(result.script.tasks).toHaveLength(2);
        expect(result.script.tasks[0].name).toBe('登录');
        expect(result.script.tasks[0].flow).toHaveLength(4);
        expect(result.script.tasks[0].flow[2].action).toBe('aiTap');
        expect(result.script.tasks[1].flow[1].action).toBe('sleep');
    });

    test('解析指定设备并打开 App 的 Android 脚本', () => {
        const result = parseScript(
            `
android:
  deviceId: test-device
tasks:
  - name: 进入 VIP
    flow:
      - launch: com.come123.game
      - aiTap: VIP
`,
            {},
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.script.target).toEqual({
            type: 'android',
            deviceId: 'test-device',
        });
        expect(result.script.tasks[0].flow[0]).toMatchObject({
            action: 'launch',
            params: 'com.come123.game',
        });
    });

    test('Android 任务缺少设备号时报错', () => {
        const result = parseScript(
            'android: {}\ntasks:\n  - name: a\n    flow:\n      - aiTap: VIP\n',
            {},
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('deviceId');
    });

    test('网页任务不能使用打开 App 步骤', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - launch: com.example.app\n',
            {},
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('Android');
    });

    test('变量替换在解析前完成', () => {
        const result = parseScript(validYaml, { PASSWORD: 's3cret' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const step = result.script.tasks[0].flow[1];
        expect(step.params).toMatchObject({ value: 's3cret' });
    });

    test('未定义的变量报错并指出变量名', () => {
        const result = parseScript(validYaml, {});
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('PASSWORD');
    });

    test('缺少 target 报错', () => {
        const result = parseScript('tasks:\n  - name: a\n    flow:\n      - ai: xxx\n', {});
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('target');
    });

    test('target 不是 http(s) 地址报错', () => {
        const result = parseScript(
            'target: ftp://a.com\ntasks:\n  - name: a\n    flow:\n      - ai: xxx\n',
            {},
        );
        expect(result.ok).toBe(false);
    });

    test('tasks 为空数组报错', () => {
        const result = parseScript('target: https://a.com\ntasks: []\n', {});
        expect(result.ok).toBe(false);
    });

    test('任务缺少 name 报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - flow:\n      - ai: xxx\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('name');
    });

    test('flow 为空报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow: []\n',
            {},
        );
        expect(result.ok).toBe(false);
    });

    test('不支持的动作报错并指出动作名', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiFly: 飞一下\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('aiFly');
    });

    test('aiInput 缺少 value 报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiInput:\n          locate: 输入框\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('value');
    });

    test('一个步骤同时写两个动作报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiTap: 按钮\n        sleep: 100\n',
            {},
        );
        expect(result.ok).toBe(false);
    });

    test('aiWaitFor 支持 timeout 辅助键', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiWaitFor: 页面加载完成\n        timeout: 10000\n',
            {},
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.script.tasks[0].flow[0].aux?.timeout).toBe(10000);
    });

    test('非 aiWaitFor 步骤写 timeout 报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiTap: 按钮\n        timeout: 1000\n',
            {},
        );
        expect(result.ok).toBe(false);
    });

    test('步骤支持 name 辅助键命名', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiTap: 按钮\n        name: 点登录\n',
            {},
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.script.tasks[0].flow[0].aux?.name).toBe('点登录');
    });

    test('步骤组支持独立 url', () => {
        const result = parseScript(
            'target: https://h5.example.com\ntasks:\n  - name: 后台接码\n    url: https://admin.example.com/sms\n    flow:\n      - aiQuery: 最新验证码\n',
            {},
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.script.tasks[0].url).toBe('https://admin.example.com/sms');
    });

    test('步骤组 url 不是 http(s) 时报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    url: ftp://a.com\n    flow:\n      - aiTap: 按钮\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('url 必须是 http(s) 地址');
    });

    test('Android 任务不能写步骤组 url', () => {
        const result = parseScript(
            'android:\n  deviceId: test-device\ntasks:\n  - name: a\n    url: https://a.com\n    flow:\n      - aiTap: 按钮\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('url 只能用于网页任务');
    });

    test('单个步骤写 url 时报错并提示写到步骤组', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiTap: 按钮\n        url: https://admin.example.com\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('url 应写在步骤组上');
    });

    test('sleep 不是正数报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - sleep: -1\n',
            {},
        );
        expect(result.ok).toBe(false);
    });

    test('aiScroll 合法方向解析成功', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiScroll:\n          direction: down\n',
            {},
        );
        expect(result.ok).toBe(true);
    });

    test('aiScroll 方向非法时报错', () => {
        const result = parseScript(
            'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - aiScroll:\n          direction: diagonal\n',
            {},
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.join('\n')).toContain('direction 必须是 up/down/left/right 之一');
    });

    test('YAML 语法错误给出可读错误', () => {
        const result = parseScript('target: [unclosed', {});
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('多个错误一次性返回', () => {
        const yaml = 'tasks:\n  - flow:\n      - aiFly: x\n      - sleep: -1\n';
        const result = parseScript(yaml, {});
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
});
