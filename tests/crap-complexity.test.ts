import { describe, expect, test } from 'bun:test';
import { collectFunctions } from '../scripts/crap/complexity';

describe('collectFunctions', () => {
    test('无分支函数 CC 为 1', () => {
        const source = 'export function ping() { return 1; }';
        const [fn] = collectFunctions(source, 'ping.ts');
        expect(fn.name).toBe('ping');
        expect(fn.cc).toBe(1);
    });

    test('if 计为一个决策点', () => {
        const source = `
      export function label(x: number) {
        if (x > 0) return "pos";
        return "other";
      }
    `;
        const [fn] = collectFunctions(source, 'label.ts');
        expect(fn.cc).toBe(2);
    });

    test('逻辑与和三元都计入 CC', () => {
        const source = `
      export function inRange(x: number) {
        return 0 < x && x < 10 ? 1 : 0;
      }
    `;
        const [fn] = collectFunctions(source, 'range.ts');
        expect(fn.cc).toBe(3);
    });

    test('switch 的 case 计入，default 不计入', () => {
        const source = `
      export function kind(x: number) {
        switch (x) {
          case 1: return "a";
          case 2: return "b";
          default: return "c";
        }
      }
    `;
        const [fn] = collectFunctions(source, 'kind.ts');
        expect(fn.cc).toBe(3);
    });

    test('嵌套函数单独计分，不并入外层', () => {
        const source = `
      export function outer(x: number) {
        if (x) {
          const inner = (y: number) => (y ? 1 : 0);
          return inner(x);
        }
        return 0;
      }
    `;
        const fns = collectFunctions(source, 'nested.ts');
        const outer = fns.find((item) => item.name === 'outer');
        const inner = fns.find((item) => item.name === 'inner');
        expect(outer?.cc).toBe(2);
        expect(inner?.cc).toBe(2);
    });

    test('catch 和空值合并计入 CC', () => {
        const source = `
      export function read(value: string | null) {
        try {
          return value ?? "fallback";
        } catch {
          return "error";
        }
      }
    `;
        const [fn] = collectFunctions(source, 'read.ts');
        expect(fn.cc).toBe(3);
    });
});
