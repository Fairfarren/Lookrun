# Web 页面按路由分目录

## 背景

`app/web/src/pages` 里页面文件平铺，`api`、`hooks`、`utils` 按技术层集中。改一个页面要在多处跳转，路由声明又和 App 壳写在一起。

## 目标

- 路由表单独放，App 只负责壳（侧栏、顶栏、主题）。
- 一条路由一个页面文件夹：`pages/<name>/index.tsx`，按需放 `api.ts`、`hooks.ts`、`utils.ts`、`components/`。
- 顶层 `api` / `components` / `utils` / `hooks` 只留被 2 个及以上页面（或 App 壳）使用的代码。
- URL 和 UI 行为不变。

## 非目标

- 不改路由 path。
- 不拆 TaskEdit / Run 的大段 JSX。
- 不把测试挪到页面目录。
- 不引入新的路由库或打包工具。

## 核心方案

### 路由与页面映射

| 路由 | 文件夹 |
| --- | --- |
| `/tasks` | `pages/tasks/` |
| `/tasks/new`、`/tasks/:id` | `pages/task-edit/`（同一模块） |
| `/queues` | `pages/queues/` |
| `/queues/new`、`/queues/:id` | `pages/queue-edit/`（同一模块） |
| `/run` | `pages/run/` |
| `/history` | `pages/history/` |
| `/history/:id` | `pages/history-detail/` |
| `/settings` | `pages/settings/` |

路由表在 `src/routes.tsx`，由 `App.tsx` 渲染。

### 页面内文件

- `index.tsx`：页面入口。
- `api.ts`：本页用到的请求，内部调用 `src/api/request.ts`。同一接口被多个页面使用时，各自写一份薄封装。
- `hooks.ts` / `utils.ts` / `components/`：有内容才建。
- 页面里已经独立的子组件（如列表的 Loading/Empty/Ready）搬进该页 `components/`。

### 顶层共享

- `src/api/request.ts`：fetch 封装。
- `src/api/types.ts`：跨页 DTO。
- `src/components`：`RunStatusTag`、`formatDuration`、`formatTime`。
- `src/utils`：`error-text`、`menu-key`、`sortable-*`、`queuesViewState`、`defaultModelId`。

## 测试

现有测试只改 import 路径，不断言逻辑。`crap-sources` 和 Stryker 中写死的页面路径一并更新。

## 风险

纯路径调整，行为不变。漏改 import 会在 `tsc` / 测试中暴露。
