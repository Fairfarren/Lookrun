import { expect, test } from 'bun:test';
import config from '../app/web/vite.config';

test('开发服务将API和WebSocket转发至同一后端并生成相对构建目录', () => {
    expect({ proxy: config.server?.proxy, build: config.build }).toEqual({
        proxy: {
            '/api': 'http://localhost:3877',
            '/ws': { target: 'ws://localhost:3877', ws: true },
        },
        build: { outDir: 'dist', emptyOutDir: true },
    });
});
