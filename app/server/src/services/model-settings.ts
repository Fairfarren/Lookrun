import { existsSync, readFileSync, renameSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '@server/config';
import embeddedModels from '@resources/models.json';
import { apiKeyConfigError, parseModelsConfig } from './models';

function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}
function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
function modelRows(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
        const row = record(item);
        return {
            id: text(row.id),
            name: text(row.name),
            model: text(row.model),
            family: text(row.family),
        };
    });
}
export function publicModelSettings(value: unknown) {
    const config = record(value);
    const apiKey = text(config.apiKey);
    return {
        baseUrl: text(config.baseUrl),
        hasApiKey: apiKey !== '' && !apiKeyConfigError(apiKey),
        models: modelRows(config.models),
    };
}
function validateBaseUrl(baseUrl: string) {
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new Error('服务地址必须是有效的 HTTP 或 HTTPS 地址');
    }
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error('服务地址必须使用 HTTP 或 HTTPS，且不能包含凭据、查询参数或片段');
    }
}

export function prepareModelSettings(value: unknown, previous: unknown) {
    const input = record(value);
    const config = {
        baseUrl: text(input.baseUrl),
        apiKey: text(input.apiKey) || text(record(previous).apiKey),
        models: modelRows(input.models),
    };
    validateBaseUrl(config.baseUrl);
    parseModelsConfig(config);
    if (new Set(config.models.map((model) => model.id)).size !== config.models.length) {
        throw new Error('模型标识不能重复');
    }
    return config;
}
export function readModelSettings() {
    const file = path.join(DATA_DIR, 'models.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : embeddedModels;
}
export async function writeModelSettings(config: ReturnType<typeof prepareModelSettings>) {
    const file = path.join(DATA_DIR, 'models.json');
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await Bun.write(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    // 原子替换，避免执行任务在保存期间读到半份配置。
    renameSync(temporary, file);
}
