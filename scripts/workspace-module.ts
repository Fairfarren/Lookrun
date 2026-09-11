import { createRequire } from 'node:module';
import path from 'node:path';

// Bun workspace 把 optional native 包挂在依赖自己的解析树里，不能写死 node_modules 相对路径

export const SERVER_PACKAGE_JSON = path.resolve('app/server/package.json');

export function resolveFromPackage(fromFile: string, moduleId: string) {
    return createRequire(fromFile).resolve(moduleId);
}

export function findFromPackage(fromFile: string, moduleId: string) {
    try {
        return resolveFromPackage(fromFile, moduleId);
    } catch (error) {
        if (isModuleNotFound(error)) {
            return undefined;
        }
        throw error;
    }
}

function isModuleNotFound(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'MODULE_NOT_FOUND'
    );
}
