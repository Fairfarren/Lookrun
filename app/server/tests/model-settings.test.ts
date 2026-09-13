import { expect, test } from 'bun:test';
import { prepareModelSettings, publicModelSettings } from '../src/services/model-settings';

const config = () => ({
    baseUrl: 'https://example.com/v1',
    apiKey: 'test-key',
    models: [{ id: 'a', name: '模型', model: 'vision', family: 'qwen3-vl' }],
});

test('读取配置不暴露密钥', () => {
    expect(publicModelSettings(config())).toEqual({
        baseUrl: 'https://example.com/v1',
        hasApiKey: true,
        models: config().models,
    });
});
test('空密钥保留原有配置', () => {
    expect(prepareModelSettings({ ...config(), apiKey: '' }, config()).apiKey).toBe('test-key');
});
test('可替换密钥并清理空白', () => {
    expect(prepareModelSettings({ ...config(), apiKey: ' new-key ' }, config()).apiKey).toBe(
        'new-key',
    );
});
test('首次配置必须提供密钥', () => {
    expect(() => prepareModelSettings({ ...config(), apiKey: '' }, {})).toThrow('apiKey');
});
test('拒绝非 HTTP 地址', () => {
    expect(() => prepareModelSettings({ ...config(), baseUrl: 'file:///tmp' }, {})).toThrow(
        '服务地址',
    );
});
test('拒绝重复模型标识', () => {
    expect(() =>
        prepareModelSettings({ ...config(), models: [config().models[0], config().models[0]] }, {}),
    ).toThrow('重复');
});
test('拒绝空模型列表', () => {
    expect(() => prepareModelSettings({ ...config(), models: [] }, {})).toThrow('非空');
});
test('拒绝纯空白模型名称', () => {
    expect(() =>
        prepareModelSettings({ ...config(), models: [{ id: 'a', model: '  ' }] }, {}),
    ).toThrow('model');
});
test('未配置密钥仍可读取模型并修复', () => {
    expect(publicModelSettings({ ...config(), apiKey: '' }).hasApiKey).toBe(false);
});
