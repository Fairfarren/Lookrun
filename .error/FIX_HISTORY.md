# 修复历史记录

## [2026-08-17 16:44:41] 修复 Windows 打包产物 Android 实时预览帧率过低

- **问题描述**：Windows 完整包运行 Android 任务时，实时画面更新频率明显低于开发环境。
- **问题原因**：连续预览依赖 scrcpy-server 提供 H.264 视频流，并依赖 FFmpeg 将采样帧转换为 JPEG；原构建脚本只安装 Sharp native 资源和 Android Platform Tools，没有为目标平台安装 FFmpeg，也没有给 Midscene 提供分发目录中的稳定资源路径。连续预览启动失败时会降级为每个步骤执行前后的截图，看起来像极低帧率。
- **修改方案**：构建时按目标平台从 `@ffmpeg-installer/ffmpeg` 的锁定映射复制或下载 FFmpeg，并将 FFmpeg 与 scrcpy-server 放入 `runtime-tools/`；服务启动时解析 EXE 同目录的资源绝对路径；使用 Bun 依赖补丁让 Midscene 优先读取这两个显式路径，同时保留开发态原有解析作为回退。
- **验证状态**：已通过
- **说明**：先增加 Windows/macOS 包映射、打包路径和资源缺失回归测试；Windows x64 交叉构建成功，产物中的 `ffmpeg.exe` 为 PE32+ x86-64，scrcpy-server 与依赖原文件一致，编译后的 EXE 包含两个显式环境变量读取逻辑。全量测试、前后端类型检查和 Web 构建通过；本机为 macOS，Windows EXE 的真机帧率仍需在 Windows 上做最终验收。

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

## [2026-07-22 20:31:15] 修复宽屏下队列任务并排显示

- **问题描述**：编辑队列时，可拖拽任务条目使用自适应宽度，宽屏下两条任务会出现在同一排。
- **修改方案**：让每个可拖拽任务条目占满容器宽度，确保一排只显示一个任务。
- **验证状态**：已通过
- **说明**：在 1600px 宽屏下添加 3 条任务，修复前前两条纵坐标相同；修复后 3 条任务纵坐标均不同，并保留拖拽排序能力。

## [2026-07-22 22:38:19] 修复历史记录展示英文模型错误

- **问题描述**：运行 57 在定位退出登录按钮失败后，历史详情直接展示模型返回的英文说明。`MIDSCENE_PREFERRED_LANGUAGE=Chinese` 仅表示首选响应语言，模型仍可能不遵守提示。
- **修改方案**：在步骤错误写入运行记录前增加中文兜底，并在读取历史详情时兼容转换已有记录。已有中文错误和非 AI 步骤错误保持原文；AI 返回英文或明显以英文为主的错误时，根据定位、断言、等待等动作生成稳定的中文失败原因，并保留脚本中的中文执行目标。不增加二次模型翻译调用，也不覆盖数据库中的原始错误。
- **验证状态**：已通过
- **说明**：先用运行 57 的英文定位失败场景补充回归测试并确认红灯；修复后 `/api/runs/57` 的运行级错误和失败步骤均返回中文。全量 112 个单元测试、前后端 TypeScript 检查、项目 Web 生产构建和 Bun 前端入口构建全部通过。

## [2026-08-17 11:59:52] 修复 Bun 加载 Android 自动化依赖失败

- **问题描述**：后端导入 `@midscene/android` 时，旧版 `source-map-support` 将 Bun 调用栈里的负列号传给 source map 解析器，抛出 `Column must be greater than or equal to 0, got -1`，服务在监听端口前退出。
- **修改方案**：使用 `bun patch` 为 `source-map-support@0.5.21` 增加位置归一化，在查询原始位置前将行号限制为至少 1、列号限制为至少 0。保留 source map 功能，不逐个禁用 Appium 依赖的安装入口。
- **验证状态**：已通过
- **说明**：新增 Android 服务模块加载回归测试；恢复 `appium-adb` 和 `teen_process` 原始实现后，仅保留统一的 source map 补丁，Bun 运行时可以正常加载 Android 服务模块。

## [2026-08-17 12:05:00] 修复打开 App 步骤未进入执行分发

- **问题描述**：Android 任务可以保存并连接设备，但真机运行 `launch` 步骤时报“未知动作：launch”。
- **修改方案**：在统一步骤分发器中识别 `launch`，校验当前 Agent 具备 Android 启动能力后执行目标包名；该确定性动作在模拟 AI 模式下也会真实执行，避免演示模式跳过 App 启动。
- **验证状态**：已通过
- **说明**：先补充步骤分发回归测试并确认失败，修复后定向测试与类型检查通过；通过产品任务运行 `launch → aiWaitFor → aiTap → aiAssert`，运行 61 的四个步骤全部成功，最终截图显示 VIP 页面。

## [2026-08-17 14:27:59] 排查 Android 实时预览黑屏

- **问题描述**：首次以约 10 FPS 验收连续预览时，网页实时画面显示全黑，示例任务中的自由 AI 导航长时间无法完成。
- **修改方案**：分别统计 scrcpy 解码结果和直接 `adb screencap` 的像素数据，确认两者均为全黑，定位为 App 当时自身进入黑屏状态，而非网页或连续帧解码损坏。强制停止并重新打开 App 后恢复画面，同时将示例任务恢复为确定性的等待、点击、断言步骤。
- **验证状态**：已通过
- **说明**：开发态网页运行 68 成功完成 `launch → aiWaitFor → aiTap → aiAssert` 并进入 VIP；运行期间收到 263 帧，平均间隔 102 毫秒，其中 255 个间隔小于 180 毫秒。macOS 打包产物运行 69 同样成功，收到 220 帧、平均间隔 105 毫秒，并确认使用程序目录内置 ADB。两次实时页面均从启动页持续更新到 VIP 页面，浏览器控制台无错误。

## [2026-08-17 14:30:28] 修复 E2E 冒烟残留服务进程

- **问题描述**：E2E 冒烟脚本调用 `server.kill()` 后没有等待子进程真正退出，旧测试服务在端口 3999 残留，后续冒烟测试连接到残留服务并收到无法解析的响应。
- **修改方案**：集中封装服务停止流程，在发送终止信号后等待 `server.exited`，确保每个场景结束前端口已经释放。
- **验证状态**：已通过
- **说明**：清理精确的残留测试进程后重新运行三类 E2E 场景，完整成功、手动停止、失败即停全部通过；测试结束后端口 3999 无监听进程，E2E 主进程也已退出。

## [2026-08-17 15:20:52] 修复 Android 按 App 名称启动失败

- **问题描述**：打开 App 步骤填写 `telegram` 时，Midscene 的固定名称映射将其解析为设备上未安装的 `org.telegram.messenger`，运行 70 报 `No activity found`；改用完整自然语言规划后，运行 71 又因重复规划 20 次而失败。
- **修改方案**：保留包名、包名/Activity 和 URI 的原生启动路径；普通 App 名称改为通过 ADB 回到桌面、打开应用列表、读取可访问性节点并按显示名称点击图标，找不到时逐页滚动并返回中文错误。任务表单同步改为提示“App 名称或包名”。
- **验证状态**：已通过
- **说明**：单元测试覆盖包名分流、大小写名称、XML 转义、图标坐标、多页滚动和未找到错误；网页创建任务并填写 `telegram` 后，运行 72 在 6.7 秒内成功且未消耗模型 Token，ADB 确认前台包为设备实际安装的 `org.telegram.messenger.web`，历史详情显示第一步成功。
