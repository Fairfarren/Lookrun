import { expect, test } from 'bun:test';
import { generateAssets, runAssetCommand } from '../scripts/gen-assets';
import { createBuildFixture } from './helpers/build-fixture';

test('生成资源模块按路径排序并转义特殊文件名', async () => {
    const fixture = createBuildFixture();
    fixture.files.set('app/web/dist/z.js', '脚本');
    fixture.files.set('app/web/dist/a".css', '样式');

    const files = await runAssetCommand(true, fixture.io);

    expect({ files, module: fixture.files.get('app/server/src/gen/assets.ts') }).toEqual({
        files: ['a".css', 'z.js'],
        module: [
            '// 由 scripts/gen-assets.ts 自动生成，请勿手改',
            '// @ts-nocheck',
            'import f0 from "../../../web/dist/a\\\".css" with { type: \'file\' };',
            'import f1 from "../../../web/dist/z.js" with { type: \'file\' };',
            '',
            'export const embeddedAssets: Record<string, string> = {',
            '  "/a\\\".css": f0,',
            '  "/z.js": f1,',
            '};',
            '',
        ].join('\n'),
    });
});

test('Windows 反斜杠路径写成 HTTP 资源键', async () => {
    const fixture = createBuildFixture();
    fixture.files.set('app/web/dist/index.html', '首页');

    const files = await generateAssets({
        ...fixture.io,
        files: async () => ['index.html', 'assets\\index-hash.js'],
    });

    expect({ files, module: fixture.files.get('app/server/src/gen/assets.ts') }).toEqual({
        files: ['assets/index-hash.js', 'index.html'],
        module: [
            '// 由 scripts/gen-assets.ts 自动生成，请勿手改',
            '// @ts-nocheck',
            'import f0 from "../../../web/dist/assets/index-hash.js" with { type: \'file\' };',
            'import f1 from "../../../web/dist/index.html" with { type: \'file\' };',
            '',
            'export const embeddedAssets: Record<string, string> = {',
            '  "/assets/index-hash.js": f0,',
            '  "/index.html": f1,',
            '};',
            '',
        ].join('\n'),
    });
});

test('前端产物缺失时生成空映射供开发服务导入', async () => {
    const fixture = createBuildFixture();

    await generateAssets(fixture.io);

    expect(fixture.files.get('app/server/src/gen/assets.ts')).toContain(
        'export const embeddedAssets: Record<string, string> = {\n};',
    );
});

test('作为模块导入的入口不写入任何资源', async () => {
    const fixture = createBuildFixture();

    await runAssetCommand(false, fixture.io);

    expect(fixture.files.size).toBe(0);
});

test('资源写入失败向命令调用者传播', async () => {
    const fixture = createBuildFixture();
    const failure = new Error('磁盘已满');

    await expect(
        runAssetCommand(true, {
            ...fixture.io,
            write: async () => {
                throw failure;
            },
        }),
    ).rejects.toThrow(failure);
});
