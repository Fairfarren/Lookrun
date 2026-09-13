import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelSettingsEditor } from '../src/pages/settings/model-settings';

test('配置加载完成前显示加载状态', () => {
    expect(renderToStaticMarkup(<ModelSettingsEditor onSaved={() => {}} />)).toContain(
        '正在加载模型配置…',
    );
});
