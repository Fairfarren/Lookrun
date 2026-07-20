# test-web-use-ai

基于 [Midscene.js](https://midscenejs.com) 的 AI 自动化测试工具：用自然语言编写 YAML 测试脚本，AI 视觉模型驱动系统 Chrome 执行，Web 页面实时查看自动化画面与每步日志。

## 功能

- **任务编辑**：YAML 格式定义 URL + 测试步骤，编辑器实时校验，支持 `{{变量}}` 占位符（账号密码不明文入库）
- **实时画面**：运行时在 Web 页面通过 CDP screencast 观看浏览器自动化过程
- **完整日志**：每一步记录当时 URL、目标、AI 识别结果、执行前后截图、耗时、Token 用量；失败即停止
- **历史记录**：最近 100 次运行可随时回看（含截图）
- **模型自检**：一键验证所选模型的视觉定位能力是否可用于 UI 自动化
- **单文件分发**：打包为 Windows / macOS 可执行文件，双击即用，数据写在程序同级 `data/` 目录

## 环境要求

- 运行时：[Bun](https://bun.sh)
- 被控浏览器：系统安装的 Google Chrome（程序自动探测）
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
bun run typecheck      # 前后端 TypeScript 检查
bun scripts/e2e-smoke.ts   # E2E 冒烟：完整跑通 / 手动停止 / 失败即停
```

## 打包

```bash
# 1. 配置模型（打包时内置，换配置需重新打包）
vim resources/models.json   # 填 baseUrl / apiKey / 模型列表

# 2. 编译本机平台可执行文件（dist/test-web-use-ai）
bun run build:exe

# 3. 交叉编译 Windows
bun scripts/build-exe.ts --target=bun-windows-x64
```

产物双击后自动启动服务并打开浏览器（`http://localhost:3877`），任务、运行记录、截图都写在程序同级的 `data/` 目录。

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

## 技术栈

Bun + Hono（API/WebSocket）+ bun:sqlite + puppeteer-core（驱动系统 Chrome）+ @midscene/web（AI 执行）+ React/Vite/antd（前端）+ CodeMirror（YAML 编辑）
