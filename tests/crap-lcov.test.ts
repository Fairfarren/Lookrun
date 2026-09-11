import { describe, expect, test } from "bun:test";
import { coverageInRange, parseLcov } from "../scripts/crap/lcov";
import { scoreFromLcov } from "../scripts/crap/report";

describe("parseLcov", () => {
  test("解析文件行命中次数", () => {
    const lcov = [
      "SF:src/demo.ts",
      "DA:1,3",
      "DA:2,0",
      "end_of_record",
    ].join("\n");

    const files = parseLcov(lcov);
    const hits = files.get("src/demo.ts");

    expect(hits?.get(1)).toBe(3);
    expect(hits?.get(2)).toBe(0);
  });
});

describe("coverageInRange", () => {
  test("按函数行范围计算覆盖率", () => {
    const hits = new Map([
      [10, 1],
      [11, 0],
      [12, 2],
      [20, 1],
    ]);

    expect(coverageInRange(hits, { startLine: 10, endLine: 12 })).toBe(2 / 3);
  });

  test("范围内没有插桩行时覆盖率为 0", () => {
    expect(coverageInRange(new Map(), { startLine: 1, endLine: 4 })).toBe(0);
  });
});

describe("scoreFromLcov", () => {
  test("有覆盖率时按公式打分", () => {
    const source = `
      export function label(x: number) {
        if (x > 0) return "pos";
        return "other";
      }
    `;
    const lcov = [
      "SF:label.ts",
      "DA:2,1",
      "DA:3,1",
      "DA:4,1",
      "end_of_record",
    ].join("\n");

    const [result] = scoreFromLcov([{ file: "label.ts", source }], lcov);

    expect(result.cc).toBe(2);
    expect(result.cov).toBe(1);
    expect(result.crap).toBe(2);
    expect(result.passed).toBe(true);
  });

  test("没有覆盖率记录时按 cov=0 打分", () => {
    const source = `
      export function branchy(x: number) {
        if (x === 1) return 1;
        if (x === 2) return 2;
        return 3;
      }
    `;

    const [result] = scoreFromLcov([{ file: "missing.ts", source }], "");

    expect(result.cc).toBe(3);
    expect(result.cov).toBe(0);
    expect(result.crap).toBe(12);
    expect(result.passed).toBe(false);
  });
});
