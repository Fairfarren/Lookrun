---
description: 使用 Bun，不要使用 Node.js、npm、pnpm 或 vite。
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

默认使用 Bun，不要使用 Node.js。

- 使用 `bun <file>`，不要使用 `node <file>` 或 `ts-node <file>`
- 使用 `bun test`，不要使用 `jest` 或 `vitest`
- 使用 `bun build <file.html|file.ts|file.css>`，不要使用 `webpack` 或 `esbuild`
- 使用 `bun install`，不要使用 `npm install`、`yarn install` 或 `pnpm install`
- 使用 `bun run <script>`，不要使用 `npm run <script>`、`yarn run <script>` 或 `pnpm run <script>`
- 使用 `bunx <package> <command>`，不要使用 `npx <package> <command>`
- Bun 会自动加载 `.env`，因此不要使用 dotenv。

## API

- `Bun.serve()` 支持 WebSocket、HTTPS 和路由。不要使用 `express`。
- 使用 `bun:sqlite` 操作 SQLite。不要使用 `better-sqlite3`。
- 使用 `Bun.redis` 操作 Redis。不要使用 `ioredis`。
- 使用 `Bun.sql` 操作 Postgres。不要使用 `pg` 或 `postgres.js`。
- `WebSocket` 是内置功能。不要使用 `ws`。
- 优先使用 `Bun.file`，不要使用 `node:fs` 的 `readFile` 或 `writeFile`。
- 使用 `` Bun.$`ls` ``，不要使用 execa。

## 测试

使用 `bun test` 运行测试。

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## 前端

通过 `Bun.serve()` 使用 HTML 导入。不要使用 `vite`。HTML 导入完整支持 React、CSS 和 Tailwind。

服务端：

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // 可选的 WebSocket 支持
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // 处理连接关闭
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML 文件可以直接导入 `.tsx`、`.jsx` 或 `.js` 文件，Bun 的打包器会自动进行转译和打包。`<link>` 标签可以指向样式表，Bun 的 CSS 打包器会自动进行打包。

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

对应的 `frontend.tsx` 如下：

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// 直接导入 CSS 文件即可生效
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

然后运行 `index.ts`：

```sh
bun --hot ./index.ts
```

更多信息请参阅 `node_modules/bun-types/docs/**.mdx` 中的 Bun API 文档。
