// TypeScript 7 主入口不再导出 parseConfigFileTextToJson。
// Stryker 改写 tsconfig 时会因此崩溃。inPlace 跳过这段，不必把项目降到 TypeScript 5。
/** @type {import('@stryker-mutator/core').StrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "command",
  commandRunner: {
    command:
      "bun test tests/port.test.ts tests/theme.test.ts tests/sortable-items.test.ts tests/validation-errors.test.ts tests/ai-error.test.ts tests/ai-result.test.ts tests/android-app-options.test.ts",
  },
  mutate: [
    "src/server/port.ts",
    "src/server/ai-error.ts",
    "src/server/ai-result.ts",
    "src/web/src/theme.ts",
    "src/web/src/sortable-items.ts",
    "src/web/src/validation-errors.ts",
    "src/web/src/android-app-options.ts",
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
    break: null,
  },
};
