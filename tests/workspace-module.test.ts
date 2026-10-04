import { describe, expect, test } from 'bun:test';
import { createPackageResolver } from '../scripts/workspace-module';

describe('工作区依赖解析', () => {
    test('同名依赖从指定包的解析树返回', () => {
        const packages = new Map([
            ['/server/package.json:sharp', '/server/node_modules/sharp/index.js'],
            ['/web/package.json:sharp', '/web/node_modules/sharp/index.js'],
        ]);
        const resolver = createPackageResolver((fromFile) => ({
            resolve: (moduleId) => packages.get(`${fromFile}:${moduleId}`)!,
        }));

        const resolved = resolver.resolve('/server/package.json', 'sharp');

        expect(resolved).toBe('/server/node_modules/sharp/index.js');
    });

    test('可选依赖存在时返回其路径', () => {
        const resolver = createPackageResolver(() => ({ resolve: () => '/native/package.json' }));

        const resolved = resolver.find(
            '/sharp/package.json',
            '@img/sharp-darwin-arm64/package.json',
        );

        expect(resolved).toBe('/native/package.json');
    });

    test('可选依赖缺失时返回 undefined', () => {
        const resolver = createPackageResolver(() => ({
            resolve: () => {
                throw { code: 'MODULE_NOT_FOUND' };
            },
        }));

        const resolved = resolver.find('/sharp/package.json', '不存在');

        expect(resolved).toBeUndefined();
    });

    test.each([null, '解析失败', new Error('无权限'), { code: 'EACCES' }])(
        '非模块缺失错误原样抛出：%p',
        (failure) => {
            const resolver = createPackageResolver(() => ({
                resolve: () => {
                    throw failure;
                },
            }));
            let result: unknown;

            try {
                resolver.find('/sharp/package.json', '异常包');
            } catch (error) {
                result = error;
            }

            expect(result).toBe(failure);
        },
    );

    test('必需依赖缺失时抛出原错误', () => {
        const failure = new Error('缺少 sharp');
        const resolver = createPackageResolver(() => ({
            resolve: () => {
                throw failure;
            },
        }));

        expect(() => resolver.resolve('/server/package.json', 'sharp')).toThrow(failure);
    });
});
