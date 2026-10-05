# Lookrun

[English](README.md) · **简体中文**

给非开发人员用的 AI 自动化测试工具。用自然语言描述点击、输入和验证步骤，Lookrun 通过视觉模型看屏幕，再由 [Midscene.js](https://midscenejs.com) 执行操作。

当前支持**本机 Chrome 网页**和 **Android 真机**。界面默认英语，在顶栏选择 **中文** 即可切换为简体中文，选择会保存在当前浏览器。暂不支持 iOS。

## 能做什么

| 功能 | 用途 |
| --- | --- |
| 任务 | 用表单编排步骤，高级写法用 YAML；保存前校验脚本。 |
| 多页面 | 每个步骤组可填写独立地址，相同地址复用已打开的页面。 |
| 队列 | 保存任务顺序，一次启动；所有任务始终串行执行。 |
| 实时画面 | 查看网页和 Android 的当前屏幕与步骤日志，失败即停，也可手动停止。 |
| 历史 | 查看截图、AI 结果、耗时和 Token 用量，自动保留最近 100 次运行。 |
| 模型配置 | 配置兼容 OpenAI 的视觉模型，自检能否返回可用的屏幕坐标。 |
| 变量 | 用 `{{USERNAME}}`、`{{PASSWORD}}` 等引用账号密码。 |

## 开始使用

拿到 Windows 或 macOS 程序包后，无需安装开发环境：

1. 解压并保留**整个程序包目录**，打开其中的可执行文件。控制台会自动打开，地址为 `http://localhost:3877`。
2. 在**设置 → AI 模型**填写服务地址、API Key 和模型名称，保存后选择默认模型，再运行**视觉自检**。使用**自由指令**前，还要选择实际模型所属的 **family**。
3. 在**任务 → 新建任务**填写任务名，选择网页或 Android，用表单添加操作步骤。
4. 保存并运行。在**实时运行**查看执行过程，在**历史记录**查看结果。固定任务组合可以存成**队列**。

测试网页需要安装 Google Chrome。测试 Android 需要开启 USB 调试，并在设备上授权这台电脑；完整程序包自带 ADB。

程序包未签名：macOS 在访达里右键可执行文件，选择「打开」；Windows 出现 SmartScreen 提示时，选择「更多信息 → 仍要运行」。

任务、历史、截图和模型配置保存在程序同级的 `data/`，备份这个目录即可保留数据。API Key 和变量值在本机以明文保存。已保存的 API Key 不会回显，留空保存会保留原密钥。

## 从源码运行

使用仓库与 CI 固定的 [Bun 1.3.14](https://bun.sh)。以下命令均在仓库根目录执行。

```bash
bun install
cp resources/models.example.json resources/models.json
bun run dev
```

开发时打开 `http://localhost:5173`，后端运行在 3877 端口。启动后在设置中配置模型，也可在启动前编辑 `resources/models.json`。

没有可用模型时，可以用演示模式跑通流程：

```bash
MOCK_AI=1 bun run dev
MOCK_AI=1 MOCK_FAIL_AT=2 bun run dev
```

第二条命令模拟第 2 步失败。单独启动一端可用 `bun run dev:server` 或 `bun run dev:web`。

| 环境变量 | 用途 |
| --- | --- |
| `SERVER_PORT` | 后端端口，默认 `3877`。 |
| `TEST_WEB_AI_DATA_DIR` | 数据目录，从源码运行时默认为仓库根目录的 `data/`。 |
| `CHROME_PATH` | 指定 Chrome 路径。 |
| `MIDSCENE_ADB_PATH` / `ANDROID_HOME` | 指定 ADB 路径或发现位置。 |

## YAML 示例

表单编辑器生成与 Midscene 兼容的 YAML。切换界面语言不会翻译已保存的任务、步骤指令或 YAML。

```yaml
target: https://example.com

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
      - aiWaitFor: 首页加载完成
        timeout: 10000
  - name: 后台接码
    url: https://admin.example.com
    flow:
      - aiAssert: 页面显示验证码
```

引用的变量在**设置 → 变量**中配置。网页默认视口为 `390 × 844`，可在顶层设置 `viewportWidth`、`viewportHeight`。

Android 使用设备号替代 `target`，步骤中可以打开 App：

```yaml
android:
  deviceId: 设备号

tasks:
  - name: 打开 App
    flow:
      - launch: com.example.app
      - aiWaitFor: 首页加载完成
        timeout: 15000
      - aiTap: VIP
      - aiAssert: 已进入 VIP 页面
```

支持动作：`ai`、`aiTap`、`aiHover`、`aiRightClick`、`aiInput`、`aiAssert`、`aiWaitFor`、`aiQuery`、`aiKeyboardPress`、`aiScroll`、`sleep`（毫秒）、`launch`。

- `launch` 只用于 Android，接受 App 名称、包名或 `包名/.Activity`。
- `aiHover`、`aiRightClick` 只用于网页。
- 任意步骤可设置 `name`，只有 `aiWaitFor` 可设置 `timeout`。
- 一份脚本只能选择网页或 Android 其中一种目标。

## 打包

```bash
# 打包前配置 resources/models.json。
bun run build:exe
bun run build:exe:win
bun run build:exe:mac
```

第一条命令构建本机平台，另外两条分别构建 Windows x64、macOS ARM64。产物目录为 `dist-win/`、`dist-mac/` 或 `dist-linux/`，可执行文件目前叫 `test-web-use-ai`。

分发时必须带上**整个产物目录**，包括 `node_modules/@img/`、`runtime-tools/` 和 Android Platform Tools。模型配置在构建时嵌入，运行后可在设置中修改，无需重新打包；运行时配置保存在 `data/models.json`。

## 开发检查

```bash
bun run check          # 格式、lint、类型检查
bun run test           # 后端、共享包和前端全量测试
bun run test:quality   # 每个文件覆盖率 100%，CRAP ≤ 8
bun run mutate         # 变异分数至少 70%
bun scripts/e2e-smoke.ts
bun scripts/build-smoke.ts dist-mac
```

用 `bun run format` 格式化代码。质量报告位于 `coverage/`，`bun run crap` 复用其中的 LCOV；变异报告位于 `reports/mutation/`。程序包冒烟前需要先构建，并使用当前平台的产物目录。

修改必须在独立分支提交，通过指向 `master` 的 PR 合并。CI 使用 Bun 1.3.14，在 PR 中执行全量质量门禁、变异测试，以及 Ubuntu、macOS、Windows 的程序包构建与启动冒烟。

| 目录 | 内容 |
| --- | --- |
| `app/web` | React 界面，英中界面文案在 `src/i18n`。 |
| `app/server` | Hono API、SQLite 存储和 Midscene 执行。 |
| `packages/shared` | 共享类型及 YAML 与表单转换。 |
| `scripts` | 构建、质量门禁和冒烟测试。 |
| `resources` | 模型配置示例及视觉自检图片。 |
