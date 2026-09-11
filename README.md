# test-web-use-ai

基于 [Midscene.js](https://midscenejs.com) 的 AI 自动化测试工具：用自然语言编写 YAML 测试脚本，AI 视觉模型驱动系统 Chrome 或 Android 真机执行，Web 页面实时查看自动化画面与每步日志。

## 功能

- **任务编辑**：选择网页 URL 或 Android 设备，定义测试步骤，编辑器实时校验，支持 `{{变量}}` 占位符（账号密码不明文入库）
- **Android 真机**：自动发现并检查已连接设备，支持打开 App 后继续执行 AI 点击、输入、等待和断言
- **实时画面**：网页任务通过 CDP screencast、Android 任务通过 scrcpy 以约 100 毫秒间隔推送最新画面
- **完整日志**：每一步记录当时 URL、目标、AI 识别结果、执行前后截图、耗时、Token 用量；失败即停止
- **历史记录**：最近 100 次运行可随时回看（含截图）
- **模型自检**：一键验证所选模型的视觉定位能力是否可用于 UI 自动化
- **完整程序包**：打包为 Windows / macOS 可执行程序，附带 sharp native 文件与 Android Platform Tools，数据写在程序同级 `data/` 目录

## 环境要求

- 运行时：[Bun](https://bun.sh)
- 被控浏览器：系统安装的 Google Chrome（程序自动探测）
- Android：设备已开启 USB 调试并授权当前电脑；正式程序包自带 ADB
- AI 模型：远程 Ollama 服务器（OpenAI 兼容接口 + API Key），需具备视觉能力

## 开发

```bash
bun install
bun run dev          # 后端 :3877 + 前端 vite :5173（开发访问 5173）
```

没有可用模型时，用演示模式跑通整条链路（AI 调用返回模拟结果）：

```bash
MOCK_AI=1 bun run dev
MOCK_AI=1 MOCK_FAIL_AT=2 bun run dev   # 模拟第 2 步失败，验证失败即停
```

## 测试与检查

```bash
bun test               # 单元测试
bun run lint           # oxlint（警告视为失败）
bun run format         # oxfmt 写入（4 空格、单引号）
bun run format:check   # oxfmt 只检查不改文件
bun run crap           # CRAP 检查（bun 覆盖率 + 圈复杂度，门槛 ≤ 8）
bun run mutate         # 变异测试（Stryker + bun test，仅已有单测的纯函数）
bun run typecheck      # 前后端 TypeScript 检查
bun scripts/e2e-smoke.ts   # E2E 冒烟：完整跑通 / 手动停止 / 失败即停
```

指向 `master` 的 Pull Request 会跑 GitHub Action：检查、lint、format、tsc、CRAP、变异测试。没有 PR 的分支不跑。

`bun run crap` 门槛是 CRAP ≤ 8。待检文件不在覆盖率报告里时按 cov=0 打分；一个函数都没扫到则失败。页面、应用壳、进程入口、HTTP 路由和设备/浏览器 I/O 编排文件暂不进门槛。

`bun run mutate` 用 Stryker 官方 command runner 跑 `bun test`，分数低于 50% 时失败。本仓库的 TypeScript 7 不必降级：Stryker 按 5.x API 改写 tsconfig 会失败，所以配置了 `inPlace`。当前改写范围是已有单测的纯函数，以及 YAML / 模型解析。

## 打包

```bash
# 1. 配置模型（打包时内置，换配置需重新打包）
vim resources/models.json   # 填 baseUrl / apiKey / 模型列表

# 2. 编译本机平台可执行文件（dist/test-web-use-ai）
bun run build:exe

# 3. 交叉编译 Windows
bun scripts/build-exe.ts --target=bun-windows-x64
```

产物双击后自动启动服务并打开浏览器（`http://localhost:3877`），任务、运行记录、截图都写在程序同级的 `data/` 目录。请分发完整的 `dist-mac/` 或 `dist-win/` 目录，不能只复制其中的可执行文件。Android 实时预览依赖的 FFmpeg 与 scrcpy-server 位于同级 `runtime-tools/`，构建脚本会按目标平台自动安装。

> macOS 未签名：首次打开需在「访达」中右键 → 打开；Windows SmartScreen 选择「仍要运行」。
> 运行时也可用 `data/models.json` 覆盖内置模型配置，无需重新打包。

## YAML 脚本格式

与 Midscene YAML 脚本对齐：

```yaml
target: https://example.com
# viewportWidth: 1280   # 可选，默认 1280
# viewportHeight: 800   # 可选，默认 800

tasks:
  - name: 登录
    flow:
      - aiInput:
          locate: 用户名输入框
          value: "{{USERNAME}}"
      - aiInput:
          locate: 密码输入框
          value: "{{PASSWORD}}"
      - aiTap: 登录按钮
      - aiWaitFor: 跳转到首页
        timeout: 10000
  - name: 验证
    flow:
      - aiAssert: 页面显示登录成功
```

支持的动作：`ai`（自由指令）、`aiTap`、`aiHover`、`aiRightClick`、`aiInput`、`aiAssert`、`aiWaitFor`、`aiQuery`、`aiKeyboardPress`、`aiScroll`、`sleep`（毫秒）。任意步骤可加 `name:` 命名；变量在「设置-变量」中维护。

Android 任务使用设备号并可在步骤中打开 App：

```yaml
android:
  deviceId: <adb devices 返回的设备号>

tasks:
  - name: 打开 App 并检查页面
    flow:
      - launch: com.example.app
      - aiWaitFor: 首页加载完成
        timeout: 15000
      - aiTap: VIP
      - aiAssert: 当前已经进入 VIP 页面
```

`launch` 仅用于 Android 任务，参数可以是包名或 `包名/.Activity`。

## 技术栈

Bun + Hono（API/WebSocket）+ bun:sqlite + puppeteer-core（驱动系统 Chrome）+ @midscene/web / @midscene/android（AI 执行）+ React/Vite/antd（前端）+ CodeMirror（YAML 编辑）
