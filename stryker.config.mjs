// TypeScript 7 主入口不再导出 parseConfigFileTextToJson。
// Stryker 改写 tsconfig 时会因此崩溃。inPlace 跳过这段，不必把项目降到 TypeScript 5。
/** @type {import('@stryker-mutator/core').StrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "command",
  commandRunner: {
    command:
      "bun test packages/server/tests/port.test.ts packages/web/tests/theme.test.ts packages/web/tests/sortable-items.test.ts packages/web/tests/validation-errors.test.ts packages/server/tests/ai-error.test.ts packages/server/tests/ai-result.test.ts packages/web/tests/android-app-options.test.ts packages/server/tests/yamlflow.test.ts packages/shared/tests/yaml-form.test.ts packages/server/tests/models.test.ts",
  },
  mutate: [
    "packages/server/src/port.ts",
    "packages/server/src/ai-error.ts",
    "packages/server/src/ai-result.ts",
    "packages/server/src/yamlflow.ts",
    "packages/server/src/models.ts",
    "packages/shared/src/yaml-form.ts",
    "packages/web/src/theme.ts",
    "packages/web/src/sortable-items.ts",
    "packages/web/src/validation-errors.ts",
    "packages/web/src/android-app-options.ts",
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
    break: 50,
  },
};
