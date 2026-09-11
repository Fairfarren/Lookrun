// 扫描 dist-web 生成资源内嵌模块，供 bun build --compile 把前端打进单文件可执行程序
import { Glob } from 'bun';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// dist-web 不存在（未执行 build:web）时生成空表，保证开发态也能编译
const files: string[] = [];
if (existsSync('dist-web')) {
    for await (const file of new Glob('**/*').scan({ cwd: 'dist-web', onlyFiles: true })) {
        files.push(file);
    }
}
files.sort();

const lines = [
    '// 由 scripts/gen-assets.ts 自动生成，请勿手改',
    '// @ts-nocheck',
    ...files.map(
        (file, index) => `import f${index} from '../../../dist-web/${file}' with { type: 'file' };`,
    ),
    '',
    'export const embeddedAssets: Record<string, string> = {',
    ...files.map((file, index) => `  '/${file}': f${index},`),
    '};',
    '',
];

mkdirSync('src/server/gen', { recursive: true });
writeFileSync('src/server/gen/assets.ts', lines.join('\n'));
console.log(`gen-assets: ${files.length} 个前端资源`);
