import { describe, expect, test } from 'bun:test';
import { ACTION_OPTIONS, formToYaml, yamlToForm, type FormScript } from '@lookrun/shared';

const fullForm: FormScript = {
    target: {
        type: 'web',
        url: 'https://example.com',
        viewportWidth: 1280,
        viewportHeight: 800,
    },
    tasks: [
        {
            id: 't1',
            name: '登录',
            steps: [
                {
                    id: 's1',
                    action: 'aiInput',
                    name: '输账号',
                    params: { locate: '用户名输入框', value: '{{USERNAME}}' },
                },
                { id: 's2', action: 'aiTap', params: { locate: '登录按钮' } },
                {
                    id: 's3',
                    action: 'aiWaitFor',
                    params: { prompt: '跳转到首页', timeout: 10000 },
                },
            ],
        },
        {
            id: 't2',
            name: '验证',
            steps: [
                {
                    id: 's4',
                    action: 'ai',
                    params: { prompt: '检查一下页面有没有报错' },
                },
                {
                    id: 's5',
                    action: 'aiAssert',
                    params: { prompt: '页面显示登录成功' },
                },
                {
                    id: 's6',
                    action: 'aiScroll',
                    params: { direction: 'down', distance: 300 },
                },
                { id: 's7', action: 'sleep', params: { ms: 500 } },
            ],
        },
    ],
};

describe('formToYaml', () => {
    test('打开 App 字段提示支持应用名称和包名', () => {
        const launchField = ACTION_OPTIONS.find((option) => option.action === 'launch')?.fields[0];

        expect(launchField).toMatchObject({
            label: 'App 名称或包名',
            placeholder: '如：ctest 或 com.example.app',
        });
    });

    test('完整表单生成合法 YAML', () => {
        const yaml = formToYaml(fullForm);
        expect(yaml).toContain('target: https://example.com');
        expect(yaml).toContain('viewportWidth: 1280');
        expect(yaml).toContain('name: 登录');
        expect(yaml).toContain('aiTap: 登录按钮');
        expect(yaml).toContain('timeout: 10000');
        expect(yaml).toContain('sleep: 500');
        expect(yaml).toContain('direction: down');
    });

    test('步骤自定义名称生成为 name 辅助键', () => {
        expect(formToYaml(fullForm)).toContain('name: 输账号');
    });

    test('步骤组独立 url 写在任务上', () => {
        const yaml = formToYaml({
            target: { type: 'web', url: 'https://h5.example.com' },
            tasks: [
                {
                    id: 't',
                    name: '后台接码',
                    url: 'https://admin.example.com/sms',
                    steps: [
                        {
                            id: 's',
                            action: 'aiQuery',
                            params: { prompt: '最新验证码' },
                        },
                    ],
                },
            ],
        });
        expect(yaml).toContain('url: https://admin.example.com/sms');
        expect(yaml).toContain('aiQuery: 最新验证码');
    });

    test('步骤组 url 留空时不写入 yaml', () => {
        const yaml = formToYaml({
            target: { type: 'web', url: 'https://h5.example.com' },
            tasks: [
                {
                    id: 't',
                    name: '登录',
                    url: '  ',
                    steps: [
                        {
                            id: 's',
                            action: 'aiTap',
                            params: { locate: '登录按钮' },
                        },
                    ],
                },
            ],
        });
        expect(yaml).not.toContain('admin.example.com');
        expect(yaml.split('\n').some((line) => line.trim().startsWith('url:'))).toBe(false);
    });

    test('视口留空时不生成视口字段', () => {
        const yaml = formToYaml({
            ...fullForm,
            target: {
                type: 'web',
                url: 'https://example.com',
            },
        });
        expect(yaml).not.toContain('viewportWidth');
        expect(yaml).not.toContain('viewportHeight');
    });

    test('特殊字符（冒号、引号、#）被正确转义', () => {
        const form: FormScript = {
            target: { type: 'web', url: 'https://a.com' },
            tasks: [
                {
                    id: 't',
                    name: '组',
                    steps: [
                        {
                            id: 's',
                            action: 'aiAssert',
                            params: { prompt: '标题是 "A: #1"' },
                        },
                    ],
                },
            ],
        };
        const roundTrip = yamlToForm(formToYaml(form));
        expect(roundTrip.ok).toBe(true);
        if (roundTrip.ok) {
            expect(roundTrip.form.tasks[0].steps[0].params.prompt).toBe('标题是 "A: #1"');
        }
    });

    test('Android 表单不输出步骤组 url', () => {
        const yaml = formToYaml({
            target: { type: 'android', deviceId: 'test-device' },
            tasks: [
                {
                    id: 't',
                    name: '进入 VIP',
                    url: 'https://admin.example.com',
                    steps: [
                        {
                            id: 's1',
                            action: 'launch',
                            params: { target: 'com.come123.game' },
                        },
                    ],
                },
            ],
        });
        expect(yaml).not.toContain('https://admin.example.com');
    });

    test('Android 表单生成设备号和打开 App 步骤', () => {
        const yaml = formToYaml({
            target: { type: 'android', deviceId: 'test-device' },
            tasks: [
                {
                    id: 't',
                    name: '进入 VIP',
                    steps: [
                        {
                            id: 's1',
                            action: 'launch',
                            params: { target: 'com.come123.game' },
                        },
                        {
                            id: 's2',
                            action: 'aiTap',
                            params: { locate: 'VIP' },
                        },
                    ],
                },
            ],
        });

        expect(yaml).toContain('deviceId: test-device');
        expect(yaml).toContain('launch: com.come123.game');
        expect(yaml).not.toContain('target: https://');
    });
});

describe('yamlToForm', () => {
    test('表单生成的 YAML 可以无损解析回表单', () => {
        const result = yamlToForm(formToYaml(fullForm));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const form = result.form;
        expect(form.target).toEqual({
            type: 'web',
            url: 'https://example.com',
            viewportWidth: 1280,
            viewportHeight: 800,
        });
        expect(form.tasks).toHaveLength(2);
        expect(form.tasks[0].name).toBe('登录');
        expect(form.tasks[0].steps[1]).toMatchObject({
            action: 'aiTap',
            params: { locate: '登录按钮' },
        });
        expect(form.tasks[0].steps[0].name).toBe('输账号');
        expect(form.tasks[0].url).toBeUndefined();
        expect(form.tasks[0].steps[2].params).toMatchObject({
            prompt: '跳转到首页',
            timeout: 10000,
        });
        expect(form.tasks[1].steps[2].params).toMatchObject({
            direction: 'down',
            distance: 300,
        });
        expect(form.tasks[1].steps[3].params).toEqual({ ms: 500 });
    });

    test('Android YAML 可以无损解析回表单', () => {
        const result = yamlToForm(`android:
  deviceId: test-device
tasks:
  - name: 进入 VIP
    flow:
      - launch: com.come123.game
      - aiTap: VIP
`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.form.target).toEqual({
            type: 'android',
            deviceId: 'test-device',
        });
        expect(result.form.tasks[0].steps[0]).toMatchObject({
            action: 'launch',
            params: { target: 'com.come123.game' },
        });
    });

    test('兼容手写格式的 aiTap 字符串与 aiScroll 嵌套对象', () => {
        const yaml = `target: https://a.com
tasks:
  - name: 组
    flow:
      - aiTap: 按钮
      - aiScroll:
          direction: up
      - aiKeyboardPress: Enter
`;
        const result = yamlToForm(yaml);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.form.tasks[0].steps[0].params).toEqual({ locate: '按钮' });
        expect(result.form.tasks[0].steps[1].params).toEqual({ direction: 'up' });
        expect(result.form.tasks[0].steps[2].params).toEqual({ key: 'Enter' });
    });

    test('带步骤组 url 的 YAML 可以解析回表单', () => {
        const result = yamlToForm(`target: https://h5.example.com
tasks:
  - name: 后台接码
    url: https://admin.example.com/sms
    flow:
      - aiQuery: 最新验证码
`);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.form.tasks[0].url).toBe('https://admin.example.com/sms');
        expect(result.form.tasks[0].steps[0]).toMatchObject({
            action: 'aiQuery',
            params: { prompt: '最新验证码' },
        });
    });

    test('包含表单不支持的字段时返回失败', () => {
        // xpath 是高级参数，表单无法表达
        const yaml = `target: https://a.com
tasks:
  - name: 组
    flow:
      - aiTap: 按钮
        xpath: //div[1]
`;
        expect(yamlToForm(yaml).ok).toBe(false);
    });

    test('不支持的动作返回失败', () => {
        const yaml = `target: https://a.com
tasks:
  - name: 组
    flow:
      - aiDoubleClick: 按钮
`;
        expect(yamlToForm(yaml).ok).toBe(false);
    });

    test('YAML 语法错误返回失败', () => {
        expect(yamlToForm('target: [unclosed').ok).toBe(false);
    });
});
