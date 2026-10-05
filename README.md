# Lookrun

**English** · [简体中文](README.zh-CN.md)

AI automation testing for people who do not write code. Describe what to click, enter and verify; Lookrun uses a vision model to operate the screen through [Midscene.js](https://midscenejs.com).

Supports **web pages in local Chrome** and **physical Android devices**. The interface defaults to English; choose **中文** in the top bar to switch to Simplified Chinese. Your language preference is saved in this browser. iOS is not supported yet.

## What you can do

| Feature | How it helps |
| --- | --- |
| Tasks | Build steps with a form, or use YAML for advanced options. Scripts are validated before saving. |
| Multiple pages | Give each step group its own URL. Matching URLs reuse an open page. |
| Queues | Save a sequence of tasks and start it together. Tasks always run one at a time. |
| Live view | Watch web and Android screens with a step log. Runs stop on failure and can be stopped manually. |
| History | Review screenshots, AI results, timings and token usage. The latest 100 runs are retained. |
| Model settings | Configure an OpenAI-compatible vision model and check whether it can return usable screen coordinates. |
| Variables | Reference values such as credentials with `{{USERNAME}}` and `{{PASSWORD}}`. |

## Get started

With a Windows or macOS application package, no development environment is required:

1. Extract and keep the **entire package folder**, then open its executable. The console opens at `http://localhost:3877`.
2. Open **Settings → AI models**. Enter your provider's base URL, API key and model name; save, choose the default model and run **Vision check**. Choose the model's actual **family** before using **AI instruction**.
3. Choose **Tasks → New task**. Enter a task name, select Web or Android and add steps in the form editor.
4. Save and run the task. Watch **Live run**, then review **History**. Use **Queues** for a repeatable sequence of tasks.

For web tests, install Google Chrome. For Android tests, enable USB debugging and authorize this computer on the device; the full package includes ADB.

Unsigned packages: on macOS, right-click the executable in Finder and choose Open; on Windows, use More info → Run anyway if SmartScreen prompts.

Tasks, history, screenshots and model settings live in the executable's adjacent `data/` directory. Back up this directory to preserve your data. API keys and variable values are stored locally in plain text. A saved API key is not displayed; leaving its field blank keeps the existing key.

## Run from source

Use [Bun 1.3.14](https://bun.sh), the version pinned for this workspace and CI. Run commands from the repository root.

```bash
bun install
cp resources/models.example.json resources/models.json
bun run dev
```

Open `http://localhost:5173` for development. The backend runs on port 3877. Configure your model in Settings, or edit `resources/models.json` before starting.

To try the workflow without a real model:

```bash
MOCK_AI=1 bun run dev
MOCK_AI=1 MOCK_FAIL_AT=2 bun run dev
```

The second command simulates failure at step 2. Start only one service with `bun run dev:server` or `bun run dev:web`.

| Variable | Purpose |
| --- | --- |
| `SERVER_PORT` | Backend port; defaults to `3877`. |
| `TEST_WEB_AI_DATA_DIR` | Data directory; defaults to the repository's `data/` when running from source. |
| `CHROME_PATH` | Override Chrome discovery. |
| `MIDSCENE_ADB_PATH` / `ANDROID_HOME` | Override ADB discovery. |

## YAML examples

The form editor generates YAML compatible with Midscene. Switching the interface language does not translate saved tasks, step instructions or YAML.

```yaml
target: https://example.com

tasks:
  - name: Sign in
    flow:
      - aiInput:
          locate: Username field
          value: "{{USERNAME}}"
      - aiInput:
          locate: Password field
          value: "{{PASSWORD}}"
      - aiTap: Sign-in button
      - aiWaitFor: The home page appears
        timeout: 10000
  - name: Check admin page
    url: https://admin.example.com
    flow:
      - aiAssert: The verification code is visible
```

Configure the referenced variables in **Settings → Variables**. Web tasks default to a `390 × 844` viewport; set `viewportWidth` and `viewportHeight` at the top level to override it.

For Android, replace `target` with a device ID and optionally launch an app:

```yaml
android:
  deviceId: YOUR_DEVICE_ID

tasks:
  - name: Open app
    flow:
      - launch: com.example.app
      - aiWaitFor: The home page appears
        timeout: 15000
      - aiTap: VIP
      - aiAssert: The VIP page is visible
```

Supported actions: `ai`, `aiTap`, `aiHover`, `aiRightClick`, `aiInput`, `aiAssert`, `aiWaitFor`, `aiQuery`, `aiKeyboardPress`, `aiScroll`, `sleep` (milliseconds) and `launch`.

- `launch` is Android-only and accepts an app name, package name or `package/.Activity`.
- `aiHover` and `aiRightClick` are web-only.
- Any step can have `name`; only `aiWaitFor` can have `timeout`.
- A script must target either web or Android.

## Build application packages

```bash
# Configure resources/models.json before building.
bun run build:exe
bun run build:exe:win
bun run build:exe:mac
```

The first command builds for the current platform; the others target Windows x64 and macOS ARM64. Outputs are `dist-win/`, `dist-mac/` or `dist-linux/`. The executable is currently named `test-web-use-ai`.

Distribute the **whole output directory**, including `node_modules/@img/`, `runtime-tools/` and Android Platform Tools. Model configuration is embedded at build time and can be changed later in Settings without rebuilding; runtime overrides are saved in `data/models.json`.

## Development checks

```bash
bun run check          # Formatting, lint and types
bun run test           # Full backend, shared and frontend tests
bun run test:quality   # 100% coverage per file; CRAP ≤ 8
bun run mutate         # Mutation score must be at least 70%
bun scripts/e2e-smoke.ts
bun scripts/build-smoke.ts dist-mac
```

Use `bun run format` to format code. Quality reports are written to `coverage/`; `bun run crap` reuses its LCOV report. Mutation reports are written to `reports/mutation/`. Build the package before running its smoke test, and use the output directory for your platform.

Changes must be made on a separate branch and merged through a PR targeting `master`. CI checks PRs with Bun 1.3.14, full quality and mutation gates, and executable build/smoke tests on Ubuntu, macOS and Windows.

| Directory | Contents |
| --- | --- |
| `app/web` | React interface and English/Chinese UI messages in `src/i18n`. |
| `app/server` | Hono API, SQLite storage and Midscene execution. |
| `packages/shared` | Shared types and YAML/form conversion. |
| `scripts` | Builds, quality gates and smoke tests. |
| `resources` | Example model configuration and vision-check image. |
