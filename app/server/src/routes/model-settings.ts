import type { Hono } from 'hono';
import { errorText } from '../lib/error-text';
import { prepareModelSettings, publicModelSettings } from '../services/model-settings';

export function registerModelSettingsRoutes(
    app: Hono,
    dependencies: {
        read: () => unknown;
        write: (config: ReturnType<typeof prepareModelSettings>) => Promise<void>;
        getSelected: () => string | null;
        setSelected: (id: string) => void;
    },
) {
    app.get('/api/models/config', (c) => {
        c.header('Cache-Control', 'no-store');
        try {
            return c.json(publicModelSettings(dependencies.read()));
        } catch {
            return c.json({ error: '模型配置文件无法读取，请检查 data/models.json' }, 500);
        }
    });
    app.put('/api/models/config', async (c) => {
        let input;
        let previous;
        try {
            input = await c.req.json();
            previous = dependencies.read();
        } catch {
            return c.json({ error: '模型配置请求或现有配置无法解析，请检查 JSON 格式' }, 400);
        }
        let config;
        try {
            config = prepareModelSettings(input, previous);
        } catch (error) {
            return c.json({ error: errorText(error) }, 400);
        }
        try {
            await dependencies.write(config);
            const selected = dependencies.getSelected();
            if (!config.models.some((model) => model.id === selected)) {
                dependencies.setSelected(config.models[0]!.id);
            }
            return c.json(publicModelSettings(config));
        } catch {
            return c.json({ error: '模型配置保存失败，请检查数据目录写入权限' }, 500);
        }
    });
}
