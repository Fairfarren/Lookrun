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

export function resolveStaticAsset(requestPath: string, embeddedAssets: Record<string, string>) {
    const assetPath = requestPath === '/' ? '/index.html' : requestPath;
    if (embeddedAssets[assetPath]) {
        return embeddedAssets[assetPath];
    }
    if (/\.[a-zA-Z0-9]+$/.test(assetPath)) {
        return undefined;
    }
    return embeddedAssets['/index.html'];
}

export function contentTypeFor(filePath: string) {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function registerStatic(app: Hono, embeddedAssets: Record<string, string>) {
    app.get('*', (c) => {
        const filePath = resolveStaticAsset(c.req.path, embeddedAssets);
        if (!filePath) {
            return c.text(
                '前端资源未构建：请先 bun run build:web；开发模式请访问 vite 端口 5173',
                404,
            );
        }
        return new Response(Bun.file(filePath), {
            headers: { 'Content-Type': contentTypeFor(filePath) },
        });
    });
}
