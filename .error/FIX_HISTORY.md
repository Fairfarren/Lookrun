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

## [2026-07-22 17:47:08] 修复历史截图点击标记不明显

- **问题描述**：运行 55 的点击截图虽然存在红色圆形靶心，但历史详情页将执行前后截图并排缩放到约 201px 宽，圆形标记缩小后不易察觉，而且执行后截图没有标记，用户无法明确看到点击位置。
- **问题原因**：原实现只在执行前截图的中心坐标绘制直径约 54px 的圆形靶心，没有利用模型返回的元素矩形，也没有针对历史页缩略图比例提供高对比框选范围。
- **修改方案**：提取点击目标的中心坐标和元素矩形，将框选范围扩展到至少 120×80px，叠加白色外描边、红色内描边、半透明底色和中心靶心；同一次点击的执行前、执行后截图都写入相同标记。
- **验证状态**：已通过
- **说明**：先补充矩形提取和边框像素测试并确认旧实现失败；修复后 95 个单元测试、前后端 TypeScript 检查、Web 构建和 E2E 冒烟全部通过。使用运行 55 的真实截图与坐标生成 200px 宽预览，执行前、执行后均能清楚看到矩形框。E2E 首次运行因 3999 端口存在旧测试进程而读取到非 JSON 响应，清理该明确端口的残留进程后完整重跑通过。

## [2026-07-22 18:40:27] 修复前端 CSS 导入类型检查失败

- **问题描述**：黑夜模式增加全局样式后，前端 TypeScript 检查报错，无法识别 `./index.css` 副作用导入。
- **修改方案**：增加前端 CSS 模块声明，让 TypeScript 接受现有构建工具支持的样式导入。
- **验证状态**：已通过
- **说明**：重新运行全量单元测试、前后端 TypeScript 检查和 Web 生产构建，结果均通过。

## [2026-07-22 20:23:40] 修复重复校验文案导致 React key 冲突

- **问题描述**：任务创建页添加多个含相同错误的步骤组后，错误列表使用重复文案作为 React key，控制台持续报告子元素 key 重复。
- **修改方案**：错误列表标识同时包含错误序号与文案，确保重复校验文案仍有唯一 key。
- **验证状态**：已通过
- **说明**：先用重复文案测试复现标识冲突，修复后单元测试通过；浏览器复验多步骤组校验错误列表时控制台无报错。

## [2026-07-22 20:24:33] 修正 Bun 前端验证入口

- **问题描述**：直接用 Bun 构建现有 `src/web/index.html` 时，HTML 内 Vite 风格的 `/src/main.tsx` 根绝对路径无法解析。
- **修改方案**：不改动现有页面入口，改为使用 Bun 直接构建真实前端入口 `src/web/src/main.tsx`，完整解析前端模块、样式和第三方拖拽依赖。
- **验证状态**：已通过
- **说明**：`bun build src/web/src/main.tsx --target browser` 成功打包 3192 个模块并生成 JavaScript 与 CSS 产物；HTML 入口构建失败属于验证命令与现有 Vite 路径约定不兼容，不涉及产品代码修改。
