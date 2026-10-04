// TypeScript 7 主入口不再导出 parseConfigFileTextToJson。
// Stryker 改写 tsconfig 时会因此崩溃。inPlace 跳过这段，不必把项目降到 TypeScript 5。
/** @type {import('@stryker-mutator/core').StrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "command",
  commandRunner: {
    command:
      "bun test app/server/tests/port.test.ts app/server/tests/crap-helpers.test.ts app/web/tests/theme.test.ts app/web/tests/sortable-items.test.ts app/web/tests/validation-errors.test.ts app/server/tests/ai-error.test.ts app/server/tests/ai-result.test.ts app/web/tests/android-app-options.test.ts app/server/tests/yamlflow.test.ts packages/shared/tests/yaml-form.test.ts app/server/tests/models.test.ts",
  },
  mutate: [
    "app/server/src/lib/port.ts",
    "app/server/src/lib/ai-error.ts",
    "app/server/src/lib/ai-result.ts",
    "app/server/src/lib/yamlflow.ts",
    "app/server/src/services/models.ts",
    "packages/shared/src/yaml-form.ts",
    "app/web/src/theme/index.ts",
    "app/web/src/utils/sortable-items.ts",
    "app/web/src/pages/task-edit/validation-errors.ts",
    "app/web/src/pages/task-edit/android-app-options.ts",
  ],
  coverageAnalysis: "off",
  disableTypeChecks: true,
  inPlace: true,
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  timeoutMS: 60000,
  concurrency: 2,
  thresholds: {
    high: 80,
    low: 60,
    break: 70,
  },
};
