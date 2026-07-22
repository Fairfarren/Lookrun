# 修复历史记录

## [2026-07-21 19:40:00] 修复 mac 打包产物运行 Midscene 时 Sharp 报错

- **问题描述**：mac 上打包出的可执行程序运行任务，AI 断言步骤报错 `Assertion failed: 判断是否登陆... Reason: Invalid image: failed to decode base64 data (Sharp is not a function. (In 'Sharp(imageBuffer)', 'Sharp' is an instance of Object))`。
- **问题原因**：Midscene 在 Node 环境通过 `@midscene/shared` 的 `imageInfoOfBase64` 调用 `Sharp(buffer).metadata()` 处理截图。sharp 是 native addon（依赖 libvips 动态库），`bun build --compile` 单文件打包无法把 sharp 的 `.node` 正确嵌入，导致加载后 `Sharp` 变成 Object 而非 Function。sharp 维护者已明确表示 bun compile 与 sharp 不兼容（<https://github.com/lovell/sharp/issues/4283）。>
- **修改方案**：
  1. 用 `bun patch` 持久化 patch `sharp/lib/sharp.js`，在 native 加载路径数组最前面插入一条「exe 同级 `node_modules/@img/sharp-{platform}/lib/sharp-{platform}.node`」的磁盘绝对路径，让 native 在运行时从磁盘加载，sharp 的 JS 仍 bundle 进 exe（`patches/sharp@0.34.5.patch` + `package.json` 的 `patchedDependencies`）。
  2. 改造 `scripts/build-exe.ts`：编译后自动把目标平台的 sharp native 包拷到 exe 同级 `node_modules/@img/`。本机已装的平台包直接拷（mac 打 mac）；交叉编译目标平台包从 npm registry 下载 tarball 解压（mac 打 win）。Windows 的 libvips 已内嵌在 `sharp-win32-x64` 包，无需独立的 libvips 包。
  3. 打包产物由单文件 exe 变为「exe + 精简 native 目录」：`dist-mac/{test-web-use-ai, node_modules/@img/...}`、`dist-win/{test-web-use-ai.exe, node_modules/@img/...}`。
- **验证状态**：已通过
- **说明**：
  - 用编译到 `dist-mac/` 的最小验证入口复现用户报错点 `imageInfoOfBase64`，返回正确宽高 `{width:640,height:360}`；`sharp(buf).resize().jpeg().toBuffer()` 链路正常（1378 bytes）。
  - 启动 `dist-mac/test-web-use-ai`：`/api/health` 返回 `{ok:true}`，`/api/system` 返回 Chrome 自动探测路径、dataDir 在 exe 同级，服务正常。
  - Windows 包从 registry 下载 `@img/sharp-win32-x64@0.34.5`（含 .node + libvips dll），文件齐全；因本机为 mac 无法实跑 Windows exe。
  - 单元测试 81 全过，前后端 TypeScript 检查通过。

## [2026-07-22 11:32:06] 修复开发环境 API 代理连接被拒绝

- **问题描述**：执行 `bun run dev` 后 Vite 页面可以打开，但访问 `/api/queues` 时反复出现 `ECONNREFUSED`。
- **问题原因**：后端启动时静态导入了打包阶段生成的资源表；该资源表引用了未提交的旧 `dist-web` 哈希文件，导致后端在监听 3877 端口前直接崩溃，Vite 代理因没有可连接的后端而报错。
- **修改方案**：将静态资源表改为由服务入口注入；仅打包产物动态加载内嵌资源，开发态由 Vite 提供页面，不再解析打包专用文件。补充回归测试，确保开发态加载静态资源模块时不依赖已构建的前端文件。
- **验证状态**：已通过
- **说明**：回归测试先稳定复现旧实现的模块加载失败，修复后全量 89 个测试、前后端 TypeScript 检查与 Web 构建通过；`bun run dev` 启动后经 Vite 访问 `/api/queues` 返回 200，浏览器页面正常渲染且无控制台错误；macOS 单文件产物构建成功，独立启动后首页和 `/api/health` 均返回 200。
