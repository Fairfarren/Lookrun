# Lookrun

给非开发人员用的 AI 自动化测试工具。打包后双击就能跑，不装 Node、不写代码。用自然语言描述步骤（点哪里、输入什么、断言什么），AI 看着屏幕去操作。

当前支持 **网页**（本机 Chrome）和 **Android 真机**。**iOS 后续再做。**

拿到程序包后：双击可执行文件，浏览器会打开控制台（`http://localhost:3877`）。任务、运行记录、截图都写在程序同级的 `data/`，换电脑把整个目录带走即可。执行引擎是 [Midscene.js](https://midscenejs.com)。

界面：任务、队列、实时运行、历史记录、设置。日常用表单编辑步骤；YAML 是给需要高级写法的人备用。

## 能做什么

- **任务**：选网页地址或已连接的 Android 设备，用表单填步骤（也可切 YAML）。保存前校验。账号密码用 `{{变量}}`，在设置里维护，不明文写进任务。
- **多页面**：每个步骤组可另填页面地址。相同地址回到已打开的页面，不新开窗口（例如 H5 发验证码后再去后台接码）。
- **队列**：把多个任务排好顺序，一次启动。运行时始终单任务串行，忙时排队。
- **实时画面**：网页和 Android 执行时都能在控制台看当前屏幕。失败即停，也可手动停止。
- **历史**：每步记下当时画面、AI 识别结果、耗时。最多留 100 次，超出自动清掉旧记录和截图。
- **模型自检**：一键测所选模型能不能看懂界面、返回可用坐标。
- **程序包**：Windows / macOS 可执行文件，附带运行所需工具。数据在程序同级 `data/`。

## 使用前准备

程序包使用者不需要装开发环境。本机准备好这些即可：

- 已安装 Google Chrome（测网页时）
- Android 设备已开 USB 调试，并授权这台电脑（测真机时；程序包自带 ADB）
- 可用的视觉模型（OpenAI 兼容接口 + API Key）。可打进程序，也可用 `data/models.json` 覆盖

macOS 未签名：访达里右键 → 打开。Windows SmartScreen 选「仍要运行」。

## 开发

从源码跑需要 [Bun](https://bun.sh)，不要用 npm / pnpm / Node。Chrome 路径可用 `CHROME_PATH`，ADB 可用 `MIDSCENE_ADB_PATH` / `ANDROID_HOME`。

```bash
bun install
cp resources/models.example.json resources/models.json   # 填 baseUrl / apiKey
bun run dev          # 后端 :3877 + 前端 Vite :5173，开发时打开 5173
```

没有可用模型时，用演示模式跑通链路（不调真实模型）：

```bash
MOCK_AI=1 bun run dev
MOCK_AI=1 MOCK_FAIL_AT=2 bun run dev   # 第 2 步失败，验证失败即停
```

单独起一端：`bun run dev:server` / `bun run dev:web`。端口用 `SERVER_PORT`（默认 3877），数据目录用 `TEST_WEB_AI_DATA_DIR`（默认仓库根下 `data/`）。

## 测试与检查

```bash
bun test
bun run lint
bun run format          # oxfmt，4 空格、单引号
bun run format:check
bun run typecheck
bun run crap            # 覆盖率 + 圈复杂度，门槛 CRAP ≤ 8
bun run mutate          # Stryker，分数低于 50% 失败
bun scripts/e2e-smoke.ts
```

指向 `master` 的 PR 会跑上述检查（E2E 冒烟除外）。没有 PR 的分支不跑 CI。

## 打包

```bash
# 1. 模型配置会打进程序；换配置要么重打包，要么运行时用 data/models.json 覆盖
cp resources/models.example.json resources/models.json
# 编辑 resources/models.json：baseUrl / apiKey / 模型列表

# 2. 本机平台
bun run build:exe

# 3. 交叉编译
bun run build:exe:win
bun run build:exe:mac
```

产物目录是 `dist-mac/`、`dist-win/`（可执行文件目前仍叫 `test-web-use-ai`）。请分发整个目录，不要只拷贝 exe。同级还需要：

- `node_modules/@img/`：sharp 的 native 文件
- `runtime-tools/`：FFmpeg、scrcpy-server（Android 实时预览）
- Android Platform Tools（ADB）

分发出去后由使用者双击运行，数据写在同级 `data/`。

## YAML

和 Midscene YAML 对齐。网页任务：

```yaml
target: https://example.com
# viewportWidth: 390    # 可选，默认 390
# viewportHeight: 844   # 可选，默认 844

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
  - name: 后台接码
    url: https://admin.example.com
    flow:
      - aiAssert: 页面显示验证码
```

Android 任务用设备号，步骤里可以打开 App：

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

动作：`ai`、`aiTap`、`aiHover`、`aiRightClick`、`aiInput`、`aiAssert`、`aiWaitFor`、`aiQuery`、`aiKeyboardPress`、`aiScroll`、`sleep`（毫秒）、`launch`。

- `launch` 只用于 Android，值可以是包名或 `包名/.Activity`
- `aiHover` / `aiRightClick` 只用于网页
- 任意步骤可加 `name:`；`timeout` 只允许写在 `aiWaitFor` 上
- 网页和 Android 不能写在同一份脚本里

## 仓库

在仓库根目录执行命令。Bun workspaces：

| 路径 | 作用 |
| --- | --- |
| `app/web` | 前端（React / Vite / antd），开发时独立启动 |
| `app/server` | 后端（Hono / bun:sqlite / puppeteer-core / Midscene） |
| `packages/shared` | 共享类型、YAML ↔ 表单 |
| `scripts` | 打包、CRAP、E2E |
| `resources` | `models.example.json`、视觉自检测试图 |
