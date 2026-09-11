import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
    findFromPackage,
    resolveFromPackage,
    SERVER_PACKAGE_JSON,
} from '../scripts/workspace-module';

describe('resolveFromPackage', () => {
    test('能从 server 包解析 sharp', () => {
        const resolved = resolveFromPackage(SERVER_PACKAGE_JSON, 'sharp/package.json');

        expect(resolved.endsWith(`${path.sep}sharp${path.sep}package.json`)).toBe(true);
    });

    test('解析不到时抛出 MODULE_NOT_FOUND', () => {
        expect(() => resolveFromPackage(SERVER_PACKAGE_JSON, 'missing-pkg-lookrun')).toThrow();
    });
});

describe('findFromPackage', () => {
    test('能从 sharp 解析当前平台 native 包', () => {
        const sharpPkg = resolveFromPackage(SERVER_PACKAGE_JSON, 'sharp/package.json');
        const nativeId = `@img/sharp-${process.platform}-${process.arch}/package.json`;

        expect(findFromPackage(sharpPkg, nativeId)?.endsWith(`${path.sep}package.json`)).toBe(true);
    });

    test('能从 ffmpeg 安装器解析当前平台包', () => {
        const ffmpegPkg = resolveFromPackage(
            SERVER_PACKAGE_JSON,
            '@ffmpeg-installer/ffmpeg/package.json',
        );
        const nativeId = `@ffmpeg-installer/${process.platform}-${process.arch}/package.json`;

        expect(findFromPackage(ffmpegPkg, nativeId)?.endsWith(`${path.sep}package.json`)).toBe(
            true,
        );
    });

    test('找不到模块时返回 undefined', () => {
        expect(findFromPackage(SERVER_PACKAGE_JSON, 'missing-pkg-lookrun')).toBeUndefined();
    });
});
