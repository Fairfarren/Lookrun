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

    test('方法调用不是函数声明', () => {
        const source = `
      export function dump(aiResult: unknown) {
        return aiResult ? JSON.stringify(aiResult) : null;
      }
    `;
        const fns = collectFunctions(source, 'stringify.ts');
        expect(fns.map((item) => item.name)).toEqual(['dump']);
        expect(fns[0].cc).toBe(2);
    });

    test('带返回类型的函数仍计入', () => {
        const source = 'export function ping(): number { return 1; }';
        const [fn] = collectFunctions(source, 'typed.ts');
        expect(fn.name).toBe('ping');
        expect(fn.cc).toBe(1);
    });

    test('三元表达式里的函数调用不是函数声明', () => {
        const source = `
      export function pick(parse: (() => number) | null) {
        return parse ? parse() : null;
      }
    `;
        const fns = collectFunctions(source, 'ternary.ts');
        expect(fns.map((item) => item.name)).toEqual(['pick']);
        expect(fns[0].cc).toBe(2);
    });

    test('Promise.catch 不是 catch 决策点', () => {
        const source = `
      export async function closeIt(browser: { close: () => Promise<void> } | null) {
        if (!browser) return;
        await browser.close().catch(() => {});
      }
    `;
        const fn = collectFunctions(source, 'close.ts').find((item) => item.name === 'closeIt');
        expect(fn?.cc).toBe(2);
    });

    test('可选属性问号不是三元决策点', () => {
        const source = `
      export function read(body: { name?: string }) {
        if (!body.name) return "";
        return body.name;
      }
    `;
        const fn = collectFunctions(source, 'opt.ts').find((item) => item.name === 'read');
        expect(fn?.cc).toBe(2);
    });

    test('可选链 catch 不是 catch 决策点', () => {
        const source = `
      export async function closeIt(browser: { close?: () => Promise<void> } | null) {
        if (!browser) return;
        await browser.close?.catch(() => {});
      }
    `;
        const fn = collectFunctions(source, 'optional-catch.ts').find(
            (item) => item.name === 'closeIt',
        );
        expect(fn?.cc).toBe(2);
    });

    test('对象返回类型不算函数体', () => {
        const source = `
      export function parseBboxJson(content: string): { ok: true } | { ok: false } {
        if (!content) return { ok: false };
        try {
          return { ok: true };
        } catch {
          return { ok: false };
        }
      }
    `;
        const fns = collectFunctions(source, 'bbox.ts');
        const fn = fns.find((item) => item.name === 'parseBboxJson');
        expect(fns.map((item) => item.name)).toEqual(['parseBboxJson']);
        expect(fn?.cc).toBe(3);
        expect(fn?.endLine).toBeGreaterThan(fn?.startLine ?? 0);
    });

    test('Promise 对象返回类型仍计入函数体', () => {
        const source = `
      export async function checkModelVision(): Promise<{ ok: boolean; message: string }> {
        if (!true) return { ok: false, message: '' };
        return { ok: true, message: '' };
      }
    `;
        const fn = collectFunctions(source, 'vision.ts').find(
            (item) => item.name === 'checkModelVision',
        );
        expect(fn?.cc).toBe(2);
        expect(fn?.endLine).toBeGreaterThan(fn?.startLine ?? 0);
    });

    test('泛型函数声明计入外层', () => {
        const source = `
      export async function activatePageSession<T>(input: { x: T }) {
        if (!input) return;
      }
      export function reorderById<T extends { id: string }>(items: T[]) {
        if (!items.length) return items;
        return items;
      }
    `;
        const fns = collectFunctions(source, 'generic.ts');
        const activate = fns.find((item) => item.name === 'activatePageSession');
        const reorder = fns.find((item) => item.name === 'reorderById');
        expect(activate?.cc).toBe(2);
        expect(reorder?.cc).toBe(2);
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

test('正则包含斜杠、花括号和决策词时不截断函数', () => {
    const source = `function parseWebTarget(value: string): { valid: boolean } {
    const pattern = /^https?:\\/\\/(?:if|case|catch){1,2}/;
    if (!pattern.test(value)) return { valid: false };
    return { valid: true };
}`;

    const functions = collectFunctions(source, 'yamlflow.ts');

    expect(functions).toEqual([
        { name: 'parseWebTarget', file: 'yamlflow.ts', startLine: 1, endLine: 5, cc: 2 },
    ]);
});

test('类型签名和重载不增加函数数目或决策点', () => {
    const source = `type Handler = (arg?: string) => { next?: () => void };
interface Config { read(value: string): number; }
declare function external(value: string): void;
function read(value: string): number;
function read(value: string | undefined) {
    return value?.length ?? 0;
}`;

    const functions = collectFunctions(source, 'types.ts');

    expect(functions).toEqual([
        { name: 'read', file: 'types.ts', startLine: 5, endLine: 7, cc: 2 },
    ]);
});

test('TSX 文本不会引入决策点，回调独立计分', () => {
    const source = `const View = () => <button onClick={() => ready ? accept() : reject()}>
    if for while catch ? &amp;&amp;
</button>;`;

    const functions = collectFunctions(source, 'view.tsx');

    expect(functions.map(({ name, cc }) => ({ name, cc }))).toEqual([
        { name: 'View', cc: 1 },
        { name: '(anonymous:1)', cc: 2 },
    ]);
});

test('异步泛型、生成器、访问器、私有方法和类属性都计入', () => {
    const source = `class Reader {
    async *read<T>(value: T) { yield value; }
    get value() { return 1; }
    set value(next: number) { if (next) this.#check(); }
    #check() { return true; }
    handler = async (value: boolean) => value ? 1 : 0;
}
const object = { 'named': function () { return 1; }, 2() { return 2; } };`;

    const functions = collectFunctions(source, 'methods.ts');

    expect(functions.map(({ name, cc }) => ({ name, cc }))).toEqual([
        { name: 'read', cc: 1 },
        { name: 'value', cc: 1 },
        { name: 'value', cc: 2 },
        { name: '#check', cc: 1 },
        { name: 'handler', cc: 2 },
        { name: 'named', cc: 1 },
        { name: '2', cc: 1 },
    ]);
});

test('模板表达式与循环完整计分且嵌套函数不累计到父函数', () => {
    const source =
        'function outer(items) { for (const item of items) { while (item) break; } do {} while (false); for (;;) break; for (const key in items) {} return `${items ? (() => 1 || 2)() : 0}`; }';

    const functions = collectFunctions(source, 'loops.ts');

    expect(functions.map(({ name, cc }) => ({ name, cc }))).toEqual([
        { name: 'outer', cc: 7 },
        { name: '(anonymous:1)', cc: 2 },
    ]);
});

test('语法错误直接失败，禁止输出不完整的通过报告', () => {
    expect(() => collectFunctions('function broken( {', 'broken.ts')).toThrow();
});
