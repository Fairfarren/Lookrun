import { buildIO, type BuildIO } from './build-io';

const WEB_DIST = 'app/web/dist';
const GEN_DIR = 'app/server/src/gen';
const ASSET_IMPORT_PREFIX = '../../../web/dist';

export async function generateAssets(io: BuildIO) {
    const files = io.exists(WEB_DIST) ? await io.files(WEB_DIST) : [];
    files.sort();
    const lines = [
        '// 由 scripts/gen-assets.ts 自动生成，请勿手改',
        '// @ts-nocheck',
        ...files.map(
            (file, index) =>
                `import f${index} from ${JSON.stringify(`${ASSET_IMPORT_PREFIX}/${file}`)} with { type: 'file' };`,
        ),
        '',
        'export const embeddedAssets: Record<string, string> = {',
        ...files.map((file, index) => `  ${JSON.stringify(`/${file}`)}: f${index},`),
        '};',
        '',
    ];
    io.mkdir(GEN_DIR);
    await io.write(`${GEN_DIR}/assets.ts`, lines.join('\n'));
    io.log(`gen-assets: ${files.length} 个前端资源`);
    return files;
}

export async function runAssetCommand(main: boolean, io: BuildIO) {
    if (!main) return;
    return generateAssets(io);
}

await runAssetCommand(import.meta.main, buildIO);
