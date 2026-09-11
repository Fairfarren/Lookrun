// 扫描前端构建产物，生成资源内嵌模块，供 bun build --compile 把页面打进单文件可执行程序
import { Glob } from 'bun';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const WEB_DIST = 'app/web/dist';
const GEN_DIR = 'app/server/src/gen';
const ASSET_IMPORT_PREFIX = '../../../web/dist';

const files: string[] = [];
if (existsSync(WEB_DIST)) {
    for await (const file of new Glob('**/*').scan({ cwd: WEB_DIST, onlyFiles: true })) {
        files.push(file);
    }
}
files.sort();

const lines = [
    '// 由 scripts/gen-assets.ts 自动生成，请勿手改',
    '// @ts-nocheck',
    ...files.map(
        (file, index) =>
            `import f${index} from '${ASSET_IMPORT_PREFIX}/${file}' with { type: 'file' };`,
    ),
    '',
    'export const embeddedAssets: Record<string, string> = {',
    ...files.map((file, index) => `  '/${file}': f${index},`),
    '};',
    '',
];

mkdirSync(GEN_DIR, { recursive: true });
writeFileSync(`${GEN_DIR}/assets.ts`, lines.join('\n'));
console.log(`gen-assets: ${files.length} 个前端资源`);
