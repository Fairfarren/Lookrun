// 编译单文件可执行程序：默认当前平台，可用参数指定交叉编译目标
// 用法：bun scripts/build-exe.ts [--target=bun-windows-x64|bun-darwin-arm64|...]
import { $ } from 'bun';
import { mkdirSync } from 'node:fs';

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const target = targetArg?.split('=')[1];

// 产物命名：跨平台编译时带上目标后缀，避免覆盖本机产物
const outName = target ? `test-web-use-ai-${target.replace('bun-', '')}` : 'test-web-use-ai';
const outFile = `dist/${outName}${target?.includes('windows') ? '.exe' : ''}`;

mkdirSync('dist', { recursive: true });

const args = ['bun', 'build', 'src/server/index.ts', '--compile', '--outfile', outFile];
if (target) {
  args.push('--target', target);
}

console.log(`编译中：${args.join(' ')}`);
await $`${args}`;
console.log(`产物：${outFile}`);
