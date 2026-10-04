import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { registerModelSettingsRoutes } from '../src/routes/model-settings';

function setup() {
    let config = {
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        models: [{ id: 'a', name: '模型', model: 'vision', family: '' }],
    };
    let selected = 'a';
    const app = new Hono();
    registerModelSettingsRoutes(app, {
        read: () => config,
        write: async (next) => {
            config = next;
        },
        getSelected: () => selected,
        setSelected: (id) => {
            selected = id;
        },
    });
    return { app, config: () => config, selected: () => selected };
}
function save(app: Hono, body: unknown) {
    return app.request('/api/models/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
test('读取配置不会返回密钥', async () => {
    const { app } = setup();
    const response = await app.request('/api/models/config');
    expect({ status: response.status, body: await response.json() }).toEqual({
        status: 200,
        body: {
            baseUrl: 'https://example.com/v1',
            hasApiKey: true,
            models: [{ id: 'a', name: '模型', model: 'vision', family: '' }],
        },
    });
});
test('保存时留空密钥会保留原值', async () => {
    const state = setup();
    const response = await save(state.app, { ...state.config(), apiKey: '' });
    expect({ status: response.status, apiKey: state.config().apiKey }).toEqual({
        status: 200,
        apiKey: 'test-key',
    });
});
test('删除默认模型后选择首个剩余模型', async () => {
    const state = setup();
    const response = await save(state.app, {
        ...state.config(),
        models: [{ id: 'b', model: 'new' }],
    });
    expect({ status: response.status, selected: state.selected() }).toEqual({
        status: 200,
        selected: 'b',
    });
});
test('保留仍有效的默认模型', async () => {
    const state = setup();
    const response = await save(state.app, {
        ...state.config(),
        models: [{ id: 'b', model: 'new' }, ...state.config().models],
    });
    expect({ status: response.status, selected: state.selected() }).toEqual({
        status: 200,
        selected: 'a',
    });
});
test('无效配置不会覆盖已保存数据', async () => {
    const state = setup();
    const response = await save(state.app, { ...state.config(), models: [] });
    expect({ status: response.status, id: state.config().models[0]?.id }).toEqual({
        status: 400,
        id: 'a',
    });
});
test('非法 JSON 返回通用错误而不泄露内容', async () => {
    const { app } = setup();
    const response = await app.request('/api/models/config', {
        method: 'PUT',
        body: 'test-secret',
    });
    expect(await response.json()).toEqual({
        error: '模型配置请求或现有配置无法解析，请检查 JSON 格式',
    });
});
test('读取失败返回通用错误', async () => {
    const app = new Hono();
    registerModelSettingsRoutes(app, {
        read: () => {
            throw new Error('test-secret');
        },
        write: async () => {},
        getSelected: () => null,
        setSelected: () => {},
    });
    expect((await app.request('/api/models/config')).status).toBe(500);
});
test('写入失败返回错误而不更新默认模型', async () => {
    const app = new Hono();
    let selected = 'old';
    registerModelSettingsRoutes(app, {
        read: () => ({}),
        write: async () => {
            throw new Error('test-secret');
        },
        getSelected: () => selected,
        setSelected: (id) => {
            selected = id;
        },
    });
    const response = await save(app, {
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        models: [{ id: 'new', model: 'vision' }],
    });
    expect({ status: response.status, body: await response.json(), selected }).toEqual({
        status: 500,
        body: { error: '模型配置保存失败，请检查数据目录写入权限' },
        selected: 'old',
    });
});
