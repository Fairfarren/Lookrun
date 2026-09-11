import { describe, expect, test } from 'bun:test';
import { parseModelsConfig, parseVisionCheckResponse } from '../src/server/models';

describe('parseModelsConfig', () => {
    test('合法配置：baseUrl 和 apiKey 平铺到每个模型', () => {
        const models = parseModelsConfig({
            baseUrl: 'https://ollama.com/v1',
            apiKey: 'sk-test',
            models: [
                { id: 'a', name: '模型A', model: 'gemma4:cloud' },
                {
                    id: 'b',
                    name: '模型B',
                    model: 'kimi-k2.7-code:cloud',
                    family: 'kimi',
                },
            ],
        });

        expect(models).toHaveLength(2);
        expect(models[0]).toMatchObject({
            id: 'a',
            model: 'gemma4:cloud',
            baseUrl: 'https://ollama.com/v1',
            apiKey: 'sk-test',
        });
        expect(models[1].family).toBe('kimi');
    });

    test('缺少 baseUrl 或 apiKey 报错', () => {
        expect(() =>
            parseModelsConfig({
                baseUrl: '',
                apiKey: 'k',
                models: [{ id: 'a', name: 'n', model: 'm' }],
            }),
        ).toThrow();
        expect(() =>
            parseModelsConfig({
                baseUrl: 'u',
                apiKey: '',
                models: [{ id: 'a', name: 'n', model: 'm' }],
            }),
        ).toThrow();
    });

    test('models 为空数组报错', () => {
        expect(() => parseModelsConfig({ baseUrl: 'u', apiKey: 'k', models: [] })).toThrow();
    });

    test('模型缺少 id 或 model 报错', () => {
        expect(() =>
            parseModelsConfig({
                baseUrl: 'u',
                apiKey: 'k',
                models: [{ id: '', name: 'n', model: 'm' }],
            }),
        ).toThrow();
        expect(() =>
            parseModelsConfig({
                baseUrl: 'u',
                apiKey: 'k',
                models: [{ id: 'a', name: 'n', model: '' }],
            }),
        ).toThrow();
    });
});

describe('parseVisionCheckResponse', () => {
    test('纯 JSON 响应解析成功', () => {
        const result = parseVisionCheckResponse('{"bbox": [180, 120, 460, 220]}');
        if (!result.ok) throw new Error('应该解析成功');
        expect(result.bbox).toEqual([180, 120, 460, 220]);
    });

    test('夹杂文字的响应也能提取 JSON', () => {
        const result = parseVisionCheckResponse(
            '按钮的位置是：{"bbox": [180, 120, 460, 220]}，在画面中央。',
        );
        if (!result.ok) throw new Error('应该解析成功');
        expect(result.bbox).toEqual([180, 120, 460, 220]);
    });

    test('markdown 代码块包裹的 JSON 可以解析', () => {
        const result = parseVisionCheckResponse('```json\n{"bbox": [200, 120, 440, 240]}\n```');
        expect(result.ok).toBe(true);
    });

    test('定位偏离按钮中心则失败', () => {
        // 格式合法但没盖住画面中心按钮（kimi 偶发的右偏返回）
        const result = parseVisionCheckResponse('{"bbox": [420, 190, 580, 270]}');
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain('未覆盖画面中心');
    });

    test('bbox 不是 4 个数字则失败', () => {
        expect(parseVisionCheckResponse('{"bbox": [1, 2, 3]}').ok).toBe(false);
        expect(parseVisionCheckResponse('{"bbox": ["a", 2, 3, 4]}').ok).toBe(false);
    });

    test('bbox 超出 1000 且不在图片范围则失败', () => {
        expect(parseVisionCheckResponse('{"bbox": [0, 0, 5000, 5000]}').ok).toBe(false);
    });

    test('0-1000 归一化坐标被接受并换算回像素（gemma4 的真实返回）', () => {
        // gemma4 对 640x360 测试图的真实返回，换算后约 [233, 143, 407, 213]
        const result = parseVisionCheckResponse('{"bbox": [364, 396, 636, 592]}');
        if (!result.ok) throw new Error('归一化坐标应该解析成功');
        expect(result.coordinateSystem).toBe('normalized');
        expect(result.bbox).toEqual([233, 143, 407, 213]);
    });

    test('归一化坐标的负值或超 1000 则失败', () => {
        expect(parseVisionCheckResponse('{"bbox": [-5, 100, 200, 300]}').ok).toBe(false);
        expect(parseVisionCheckResponse('{"bbox": [100, 200, 1200, 300]}').ok).toBe(false);
    });

    test('bbox 面积为零则失败', () => {
        expect(parseVisionCheckResponse('{"bbox": [10, 10, 10, 10]}').ok).toBe(false);
    });

    test('响应里没有 bbox 则失败', () => {
        expect(parseVisionCheckResponse('我看不懂这张图').ok).toBe(false);
    });
});
