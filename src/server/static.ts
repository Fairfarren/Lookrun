import type { Hono } from 'hono';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// 前端静态资源：打包后使用二进制内嵌文件，开发页面由 Vite 提供
// 非文件路径一律回退到 index.html（SPA 前端路由）
export function registerStatic(app: Hono, embeddedAssets: Record<string, string>) {
  app.get('*', (c) => {
    const requestPath = c.req.path === '/' ? '/index.html' : c.req.path;
    const isFileRequest = /\.[a-zA-Z0-9]+$/.test(requestPath);
    const filePath = embeddedAssets[requestPath] ?? (isFileRequest ? undefined : embeddedAssets['/index.html']);
    if (!filePath) {
      return c.text('前端资源未构建：请先 bun run build:web；开发模式请访问 vite 端口 5173', 404);
    }
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return new Response(Bun.file(filePath), {
      headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
    });
  });
}
