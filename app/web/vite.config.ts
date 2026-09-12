import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 后端服务端口，与 app/server/src/config.ts 中的 SERVER_PORT 保持一致
const SERVER_PORT = 3877;

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': `http://localhost:${SERVER_PORT}`,
            '/ws': {
                target: `ws://localhost:${SERVER_PORT}`,
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
