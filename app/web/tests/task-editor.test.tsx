import './helpers/dom';
import { expect, test } from 'bun:test';
import TaskEditPage from '../src/pages/task-edit';
import {
    keyboardDrag,
    button,
    choose,
    click,
    deferred,
    field,
    flush,
    input,
    latestNotice,
    renderPage,
    stubDelay,
    useDomTests,
    useHttp,
} from './helpers/render';

useDomTests();

const validYaml =
    'target: https://example.com\ntasks:\n  - name: 登录\n    flow:\n      - aiTap: 登录按钮\n';
function initial(path: string) {
    if (path === '/api/tasks/1') return { id: 1, name: '原任务', yaml: validYaml };
    if (path === '/api/tasks/validate') return { ok: true, errors: [] };
    if (path === '/api/system/android-devices')
        return {
            devices: [
                { id: 'dev-a', name: '手机甲' },
                { id: 'dev-b', name: '手机乙' },
            ],
        };
    if (path.startsWith('/api/system/android-apps'))
        return { apps: [{ packageName: 'org.example.demo', name: '示例应用' }] };
    if (path === '/api/system/android-devices/check')
        return { ok: true, device: { name: '手机甲' } };
    throw new Error(`意外请求：${path}`);
}

test('新建网页任务编辑目标、视口、步骤组与步骤后校验并保存', async () => {
    const validate = stubDelay(800);
    let saved: { name: string; yaml: string } | undefined;
    useHttp(({ path, body }) => {
        if (path === '/api/tasks') {
            saved = body as typeof saved;
            return { id: 1 };
        }
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/new' });
    await click(button('保存'));
    expect(latestNotice()?.title).toBe('请填写任务名');
    await input(field('例如：登录冒烟测试'), ' 新任务 ');
    await input(field('起始页面地址，如 https://h5.example.com'), 'https://example.com');
    await input(field('视口宽(默认390)'), '400');
    await input(field('视口高(默认844)'), '900');
    await input(field('步骤组名称，如：登录'), '登录');
    await input(field('本步骤组页面地址（可选，相同则复用）'), 'https://example.com/login');
    await input(field('如：登录按钮'), '登录按钮');
    await input(field('步骤名(可选)'), '点击登录');
    await validate();
    expect(document.querySelector('[data-testid="script-validation-banner"]')?.textContent).toBe(
        '校验通过',
    );

    await click(button('保存'));

    expect({ ...saved }).toMatchObject({
        name: '新任务',
        yaml: expect.stringContaining('viewportWidth: 400'),
    });
    expect(saved?.yaml).toContain('name: 点击登录');
});

test('编辑已保存任务可添加删除步骤和组，切换动作编辑数字和选择参数', async () => {
    stubDelay(800);
    let saved: { yaml: string } | undefined;
    useHttp(({ path, method, body }) => {
        if (method === 'PUT') {
            saved = body as typeof saved;
            return { id: 1 };
        }
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('添加步骤'));
    await choose(1, '固定等待');
    await input(field('1000'), '250');
    await click(button('添加步骤'));
    await choose(2, '滚动页面');
    await choose(3, '向上');
    await input(field('留空自动'), '300');
    await click(button('删除步骤'));
    await click(button('添加步骤组'));
    const groups = document.querySelectorAll<HTMLInputElement>(
        'input[placeholder="步骤组名称，如：登录"]',
    );
    await input(groups[1]!, '可删除步骤组');
    await click(
        [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="删除步骤组"]')][1]!,
    );

    await click(button('保存'));

    expect(saved?.yaml).toContain('sleep: 250');
    expect(saved?.yaml).toContain('direction: up');
    expect(saved?.yaml).not.toContain('可删除步骤组');
});

test('保存时校验失败不写入任务，并展示服务端错误列表', async () => {
    const validate = stubDelay(800);
    const requests = useHttp(({ path }) =>
        path === '/api/tasks/validate' ? { ok: false, errors: ['缺少页面地址'] } : initial(path),
    );
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await validate();

    await click(button('保存'));

    expect({
        writes: requests.filter((item) => item.method === 'PUT'),
        content: document.body.textContent,
        message: latestNotice()?.title,
    }).toEqual({
        writes: [],
        content: expect.stringContaining('缺少页面地址'),
        message: '脚本校验未通过，请先修复错误',
    });
});

test('任务保存失败保留表单，恢复按钮', async () => {
    stubDelay(800);
    useHttp(({ path, method }) =>
        method === 'PUT'
            ? Response.json({ error: '任务写入失败' }, { status: 500 })
            : initial(path),
    );
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });

    await click(button('保存'));

    expect({
        name: field('例如：登录冒烟测试').value,
        disabled: button('保存').disabled,
        message: latestNotice()?.title,
    }).toEqual({ name: '原任务', disabled: false, message: '任务写入失败' });
});

test('加载任务失败反馈错误，返回导航可用', async () => {
    stubDelay(800);
    useHttp(() => Response.json({ error: '任务读取失败' }, { status: 500 }));
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    expect(latestNotice()?.title).toBe('任务读取失败');

    await click(button('返回'));

    expect(document.querySelector('[data-testid="location"]')?.textContent).toBe('/tasks');
});

test('切换 Android 自动读取设备与应用，编辑应用并检查连接', async () => {
    stubDelay(800);
    let saved: { yaml: string } | undefined;
    useHttp(({ path, method, body }) => {
        if (path === '/api/tasks/1' && method === 'PUT') {
            saved = body as typeof saved;
            return { id: 1 };
        }
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('Android'));
    await choose(0, '手机乙（dev-b）');
    await click(button('刷新设备'));
    await choose(1, '打开 App');
    await input(field('如：ctest 或 com.example.app'), 'org.example.demo');
    await click(document.querySelector<HTMLButtonElement>('button[title="刷新应用列表"]')!);
    await click(button('检查连接'));
    expect(latestNotice()?.title).toBe('设备 手机甲 连接正常');

    await click(button('保存'));

    expect(saved?.yaml).toContain('deviceId: dev-b');
    expect(saved?.yaml).toContain('launch: org.example.demo');
});

test.each([
    { response: { ok: false, message: '设备未授权' }, expected: '设备未授权' },
    {
        response: Response.json({ error: '设备请求失败' }, { status: 500 }),
        expected: '设备请求失败',
    },
])('Android 检查失败反馈实际原因：%j', async ({ response, expected }) => {
    stubDelay(800);
    useHttp(({ path }) => (path.endsWith('/check') ? response : initial(path)));
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('Android'));

    await click(button('检查连接'));

    expect(latestNotice()?.title).toBe(expected);
});

test('Android 设备和应用请求失败可以刷新重试', async () => {
    stubDelay(800);
    let failed = true;
    useHttp(({ path }) => {
        if (path.includes('android') && failed)
            return Response.json({ error: '设备服务失败' }, { status: 500 });
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('Android'));
    expect(button('检查连接').disabled).toBe(true);
    failed = false;
    await click(button('刷新设备'));
    await choose(1, '打开 App');
    failed = true;

    await click(document.querySelector<HTMLButtonElement>('button[title="刷新应用列表"]')!);

    expect(latestNotice()?.title).toBe('设备服务失败');
});

test('切换设备后旧应用响应不会覆盖新设备列表', async () => {
    stubDelay(800);
    const pending = deferred<{ apps: { packageName: string }[] }>();
    useHttp(({ path }) => {
        if (path.endsWith('deviceId=dev-a')) return pending.promise;
        if (path.endsWith('deviceId=dev-b'))
            return { apps: [{ packageName: 'org.new.application' }] };
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('Android'));
    await choose(0, '手机乙（dev-b）');
    await choose(1, '打开 App');

    await flush(() => pending.resolve({ apps: [{ packageName: 'org.stale.application' }] }));

    expect(
        [...document.querySelectorAll('datalist option')].map((option) =>
            option.getAttribute('value'),
        ),
    ).toEqual(['org.new.application']);
});

test('表单和 YAML 模式可往返，格式化不会丢失脚本', async () => {
    stubDelay(800);
    useHttp(({ path }) => initial(path));
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });

    await click(button('YAML 编辑'));
    expect(document.querySelector('.cm-content')?.textContent).toContain('https://example.com');
    await click(button('表单编辑'));

    expect(field('起始页面地址，如 https://h5.example.com').value).toBe('https://example.com');
});

test('包含高级内容的旧脚本锁定 YAML，切换表单给出提示', async () => {
    stubDelay(800);
    useHttp(({ path }) =>
        path === '/api/tasks/1'
            ? {
                  id: 1,
                  name: '高级任务',
                  yaml: 'target: https://example.com\ntasks:\n  - name: 高级\n    flow:\n      - unsupportedAction: true\n',
              }
            : initial(path),
    );
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });

    await click(button('表单编辑'));

    expect({
        editor: Boolean(document.querySelector('.cm-content')),
        message: latestNotice()?.title,
    }).toEqual({
        editor: true,
        message: '当前 YAML 包含表单不支持的内容，无法切换；请先在 YAML 里修正',
    });
});

test('自动校验服务故障显示错误，保存仍被阻止且表单保留', async () => {
    const validate = stubDelay(800);
    const requests = useHttp(({ path }) =>
        path === '/api/tasks/validate'
            ? Response.json({ error: '校验服务离线' }, { status: 503 })
            : initial(path),
    );
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await click(button('网页'));
    await validate();
    const validationMessage = document.querySelector(
        '[data-testid="script-validation-banner"]',
    )?.textContent;

    await click(button('保存'));

    expect({
        validationMessage,
        name: field('例如：登录冒烟测试').value,
        message: latestNotice()?.title,
        writes: requests.filter((request) => request.method === 'PUT'),
    }).toEqual({
        validationMessage: '脚本存在问题脚本校验失败：校验服务离线',
        name: '原任务',
        message: '校验服务离线',
        writes: [],
    });
});

test('自动校验网络故障恢复后再次编辑会显示新的成功结果', async () => {
    const validate = stubDelay(800);
    let offline = true;
    useHttp(({ path }) => {
        if (path === '/api/tasks/validate' && offline) throw new Error('网络连接中断');
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    await validate();
    const failedMessage = document.querySelector(
        '[data-testid="script-validation-banner"]',
    )?.textContent;

    offline = false;
    await input(field('如：登录按钮'), '重新登录按钮');
    await validate();

    expect({
        before: failedMessage,
        after: document.querySelector('[data-testid="script-validation-banner"]')?.textContent,
    }).toEqual({
        before: '脚本存在问题脚本校验失败：网络连接中断',
        after: '校验通过',
    });
});

test('键盘拖拽步骤和步骤组后保存顺序与用户调整一致', async () => {
    stubDelay(800);
    let saved: { yaml: string } | undefined;
    const yaml =
        'target: https://example.com\ntasks:\n  - name: 第一组\n    flow:\n      - aiTap: 按钮甲\n      - aiTap: 按钮乙\n  - name: 第二组\n    flow:\n      - aiTap: 按钮丙\n';
    useHttp(({ path, method, body }) => {
        if (method === 'PUT') {
            saved = body as typeof saved;
            return { id: 1 };
        }
        if (path === '/api/tasks/1') return { id: 1, name: '排序任务', yaml };
        return initial(path);
    });
    await renderPage(<TaskEditPage />, { path: '/tasks/:id', url: '/tasks/1' });
    const stepHandles = [
        ...document.querySelectorAll<HTMLButtonElement>('button[aria-label*="个步骤进行排序"]'),
    ].slice(0, 2);
    await keyboardDrag(stepHandles);
    const groupHandles = [
        ...document.querySelectorAll<HTMLButtonElement>('button[aria-label*="个步骤组进行排序"]'),
    ];
    await keyboardDrag(groupHandles);

    await click(button('保存'));

    expect(saved?.yaml).toBe(
        'target: https://example.com\ntasks:\n  - name: 第二组\n    flow:\n      - aiTap: 按钮丙\n  - name: 第一组\n    flow:\n      - aiTap: 按钮乙\n      - aiTap: 按钮甲\n',
    );
});
