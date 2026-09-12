import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelConfig } from '@lookrun/shared';
import { DATA_DIR } from '../config';
import { formatModelServiceError } from '../lib/ai-error';
import { errorText } from '../lib/error-text';
// 构建时内置的模型列表；运行时可用 data/models.json 覆盖
import embeddedModelsJson from '../../../../resources/models.json';
// 视觉自检测试图，bun build --compile 时随二进制内嵌
import visionCheckPngPath from '../../../../resources/vision-check.png' with { type: 'file' };

// 自检测试图的尺寸，生成 resources/vision-check.png 时使用的视口
export const VISION_CHECK_WIDTH = 640;
export const VISION_CHECK_HEIGHT = 360;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const HTTP_HEADER_SAFE_PATTERN = /^[\u0020-\u007E]+$/;

function requireText(value: unknown, message: string) {
    if (typeof value !== 'string' || value === '') {
        throw new Error(message);
    }
    return value;
}

export function apiKeyConfigError(apiKey: string) {
    if (HTTP_HEADER_SAFE_PATTERN.test(apiKey)) {
        return null;
    }
    return 'API Key 含有非法字符，无法用于请求（请检查是否仍是占位符）';
}

function requireApiKey(value: unknown) {
    const apiKey = requireText(value, '模型配置缺少 apiKey');
    const error = apiKeyConfigError(apiKey);
    if (error) {
        throw new Error(error);
    }
    return apiKey;
}

function requireModelList(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('模型配置的 models 必须是非空数组');
    }
    return value;
}

// 解析模型配置文件：顶层的 baseUrl/apiKey 平铺到每个模型上
export function parseModelsConfig(json: unknown): ModelConfig[] {
    if (!isRecord(json)) {
        throw new Error('模型配置必须是一个对象');
    }
    requireText(json.baseUrl, '模型配置缺少 baseUrl');
    requireApiKey(json.apiKey);
    return requireModelList(json.models).map((item, index) => parseModelEntry(item, index, json));
}

function optionalText(value: unknown) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseModelEntry(item: unknown, index: number, json: Record<string, unknown>): ModelConfig {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') {
        throw new Error(`第 ${index + 1} 个模型缺少 id`);
    }
    if (typeof item.model !== 'string' || item.model === '') {
        throw new Error(`第 ${index + 1} 个模型缺少 model 字段`);
    }
    return {
        id: item.id,
        name: optionalText(item.name) ?? item.model,
        model: item.model,
        baseUrl: json.baseUrl as string,
        apiKey: json.apiKey as string,
        family: optionalText(item.family),
    };
}

function readOverrideModels(overridePath: string) {
    try {
        return parseModelsConfig(JSON.parse(readFileSync(overridePath, 'utf8')));
    } catch (error) {
        throw new Error(`运行时模型配置 ${overridePath} 解析失败：${errorText(error)}`);
    }
}

// 加载模型列表：优先 data/models.json（运行时覆盖），否则用构建时内置的配置
export function loadModels() {
    const overridePath = path.join(DATA_DIR, 'models.json');
    if (existsSync(overridePath)) {
        return readOverrideModels(overridePath);
    }
    return parseModelsConfig(embeddedModelsJson);
}

export function modelsFromLoad(load: () => ModelConfig[]) {
    try {
        return { ok: true as const, models: load() };
    } catch (error) {
        return { ok: false as const, error: errorText(error) };
    }
}

export function tryLoadModels() {
    return modelsFromLoad(loadModels);
}

export function modelVisionCheckTarget(id: string, loaded: ReturnType<typeof tryLoadModels>) {
    if (!loaded.ok) {
        return { ok: false as const, status: 500 as const, error: loaded.error };
    }
    const model = getModelById(loaded.models, id);
    if (!model) {
        return { ok: false as const, status: 404 as const, error: '模型不存在' };
    }
    return { ok: true as const, model };
}

export function getModelById(models: ModelConfig[], id: string) {
    return models.find((model) => model.id === id) ?? null;
}

// 把模型配置转成 Midscene Agent 的 modelConfig 参数
export function toMidsceneModelConfig(model: ModelConfig) {
    return {
        MIDSCENE_MODEL_NAME: model.model,
        MIDSCENE_MODEL_API_KEY: model.apiKey,
        MIDSCENE_MODEL_BASE_URL: model.baseUrl,
        ...(model.family ? { MIDSCENE_MODEL_FAMILY: model.family } : {}),
    };
}

// ---------- 视觉自检 ----------

export type VisionCheckResult =
    | { ok: true; bbox: number[]; coordinateSystem: 'absolute' | 'normalized' }
    | { ok: false; reason: string };

const NORMALIZED_COORD_MAX = 1000;

function isPlausibleBBox(bbox: number[]) {
    const [x1, y1, x2, y2] = bbox;
    return (
        x1 >= 0 &&
        y1 >= 0 &&
        x2 <= VISION_CHECK_WIDTH &&
        y2 <= VISION_CHECK_HEIGHT &&
        x2 > x1 &&
        y2 > y1
    );
}

// 测试图的按钮在画面正中央，定位正确的 bbox 必然包含图片中心点
function containsCenter(bbox: number[]) {
    const [x1, y1, x2, y2] = bbox;
    return (
        x1 <= VISION_CHECK_WIDTH / 2 &&
        x2 >= VISION_CHECK_WIDTH / 2 &&
        y1 <= VISION_CHECK_HEIGHT / 2 &&
        y2 >= VISION_CHECK_HEIGHT / 2
    );
}

// 从模型回复里提取 bbox JSON 并校验。
// 两种坐标系都接受：绝对像素（在图片范围内）或 qwen 系 0-1000 归一化坐标
// （gemma/minimax/kimi 走 Ollama 时都是归一化格式，参考 test-game/step2-v2 的生产验证）
function bboxJsonSlice(content: string) {
    return content.match(/\{[^{}]*"bbox"[^{}]*\}/)?.[0] ?? null;
}

function isFiniteNumberList(values: unknown): values is number[] {
    if (!Array.isArray(values)) {
        return false;
    }
    return values.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function bboxFromUnknown(
    parsed: unknown,
): { ok: true; bbox: number[] } | { ok: false; reason: string } {
    if (!isRecord(parsed) || !isFiniteNumberList(parsed.bbox) || parsed.bbox.length !== 4) {
        return { ok: false, reason: 'bbox 必须是 4 个数字的数组' };
    }
    const bbox = parsed.bbox;
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
        return { ok: false, reason: 'bbox 面积为零' };
    }
    return { ok: true, bbox };
}

function parseBboxJsonSlice(
    slice: string,
): { ok: true; bbox: number[] } | { ok: false; reason: string } {
    try {
        return bboxFromUnknown(JSON.parse(slice));
    } catch {
        return { ok: false, reason: 'bbox JSON 无法解析' };
    }
}

function parseBboxJson(
    content: string,
): { ok: true; bbox: number[] } | { ok: false; reason: string } {
    const slice = bboxJsonSlice(content);
    if (!slice) {
        return { ok: false, reason: '回复中没有找到 bbox JSON' };
    }
    return parseBboxJsonSlice(slice);
}

function absoluteVisionResult(bbox: number[]): VisionCheckResult | null {
    if (!isPlausibleBBox(bbox)) {
        return null;
    }
    if (!containsCenter(bbox)) {
        return {
            ok: false,
            reason: `定位偏差过大：bbox [${bbox.join(', ')}] 未覆盖画面中心的按钮`,
        };
    }
    return { ok: true, bbox, coordinateSystem: 'absolute' };
}

function normalizedVisionResult(bbox: number[]): VisionCheckResult | null {
    if (!bbox.every((n) => n >= 0 && n <= NORMALIZED_COORD_MAX)) {
        return null;
    }
    const [x1, y1, x2, y2] = bbox;
    const rescaled = [
        (x1 * VISION_CHECK_WIDTH) / NORMALIZED_COORD_MAX,
        (y1 * VISION_CHECK_HEIGHT) / NORMALIZED_COORD_MAX,
        (x2 * VISION_CHECK_WIDTH) / NORMALIZED_COORD_MAX,
        (y2 * VISION_CHECK_HEIGHT) / NORMALIZED_COORD_MAX,
    ];
    if (isPlausibleBBox(rescaled) && containsCenter(rescaled)) {
        return {
            ok: true,
            bbox: rescaled.map(Math.round),
            coordinateSystem: 'normalized',
        };
    }
    return null;
}

export function parseVisionCheckResponse(content: string): VisionCheckResult {
    const parsed = parseBboxJson(content);
    if (!parsed.ok) {
        return parsed;
    }
    const absolute = absoluteVisionResult(parsed.bbox);
    if (absolute) {
        return absolute;
    }
    const normalized = normalizedVisionResult(parsed.bbox);
    if (normalized) {
        return normalized;
    }
    return {
        ok: false,
        reason: `bbox 既不是合法像素坐标也不是 0-1000 归一化坐标：[${parsed.bbox.join(', ')}]`,
    };
}

const VISION_CHECK_PROMPT =
    '这是一张网页截图，画面中央有一个写着「确定按钮」的蓝色按钮。请定位这个按钮，只回复 JSON，格式：{"bbox": [x1, y1, x2, y2]}，坐标为像素值。';
const VISION_CHECK_TIMEOUT_MS = 60_000;

async function loadVisionCheckImage() {
    const buffer = await Bun.file(visionCheckPngPath).arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}

export function visionTimeoutMs(timeoutMs: number | undefined) {
    return timeoutMs ?? VISION_CHECK_TIMEOUT_MS;
}

export function visionChatUrl(baseUrl: string) {
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

export function visionHttpError(status: number, body: string) {
    return { ok: false as const, message: `接口返回 ${status}：${body.slice(0, 200)}` };
}

export function visionResponseContent(data: { choices?: { message?: { content?: string } }[] }) {
    return data.choices?.[0]?.message?.content ?? '';
}

export function visionOkMessage(result: { coordinateSystem: string; bbox: number[] }) {
    if (result.coordinateSystem === 'normalized') {
        return `视觉能力正常（0-1000 归一化坐标），定位坐标 [${result.bbox.join(', ')}]`;
    }
    return `视觉能力正常（绝对像素坐标），定位坐标 [${result.bbox.join(', ')}]`;
}

export function visionCheckOutcome(result: VisionCheckResult) {
    if (result.ok) {
        return { ok: true as const, message: visionOkMessage(result) };
    }
    return { ok: false as const, message: `模型无法用于 UI 自动化：${result.reason}` };
}

export function visionRequestError(error: unknown) {
    const raw = errorText(error);
    const friendly = formatModelServiceError(raw);
    if (friendly) {
        return { ok: false as const, message: friendly };
    }
    return { ok: false as const, message: `自检请求失败：${raw}` };
}

function visionCheckBody(model: string, imageBase64: string) {
    return JSON.stringify({
        model,
        temperature: 0,
        // 推理型模型（如 kimi）会先消耗思考预算，给小了会返回空内容
        max_tokens: 1500,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: VISION_CHECK_PROMPT },
                    {
                        type: 'image_url',
                        image_url: { url: `data:image/png;base64,${imageBase64}` },
                    },
                ],
            },
        ],
    });
}

async function runVisionCheck(model: ModelConfig, timeoutMs: number) {
    const imageBase64 = await loadVisionCheckImage();
    const response = await fetch(visionChatUrl(model.baseUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
        },
        body: visionCheckBody(model.model, imageBase64),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
        return visionHttpError(response.status, await response.text());
    }
    const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
    };
    return visionCheckOutcome(parseVisionCheckResponse(visionResponseContent(data)));
}

// 视觉自检：给模型发一张带按钮的测试图，验证它能否返回可解析的元素坐标
// 这是模型能否用于 UI 自动化的分水岭：能看图不代表能返回坐标
export async function checkModelVision(model: ModelConfig, options: { timeoutMs?: number } = {}) {
    try {
        return await runVisionCheck(model, visionTimeoutMs(options.timeoutMs));
    } catch (error) {
        return visionRequestError(error);
    }
}
