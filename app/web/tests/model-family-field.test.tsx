import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelFamilyField } from '../src/pages/settings/model-family-field';

test('不设置时说明自由指令限制', () => {
    expect(renderToStaticMarkup(<ModelFamilyField value='' onChange={() => {}} />)).toContain(
        '使用「自由指令」前必须选择',
    );
});
test('已保存的已知系列被选中并显示适用说明', () => {
    expect(
        renderToStaticMarkup(<ModelFamilyField value='qwen3-vl' onChange={() => {}} />),
    ).toContain('value="qwen3-vl" selected=""');
});
test('未知旧值保留并提示重新选择', () => {
    expect(
        renderToStaticMarkup(<ModelFamilyField value='old-family' onChange={() => {}} />),
    ).toContain('已有配置：old-family（当前版本未支持）');
});
