import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelConfig } from '../shared/types';
import { DATA_DIR } from './config';
// 构建时内置的模型列表；运行时可用 data/models.json 覆盖
import embeddedModelsJson from '../../resources/models.json';

// 自检测试图的尺寸，生成 resources/vision-check.png 时使用的视口
export const VISION_CHECK_WIDTH = 640;
export const VISION_CHECK_HEIGHT = 360;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 解析模型配置文件：顶层的 baseUrl/apiKey 平铺到每个模型上
export function parseModelsConfig(json: unknown): ModelConfig[] {
  if (!isRecord(json)) {
    throw new Error('模型配置必须是一个对象');
  }
  if (typeof json.baseUrl !== 'string' || json.baseUrl === '') {
    throw new Error('模型配置缺少 baseUrl');
  }
  if (typeof json.apiKey !== 'string' || json.apiKey === '') {
    throw new Error('模型配置缺少 apiKey');
  }
  if (!Array.isArray(json.models) || json.models.length === 0) {
    throw new Error('模型配置的 models 必须是非空数组');
  }
  return json.models.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') {
      throw new Error(`第 ${index + 1} 个模型缺少 id`);
    }
    if (typeof item.model !== 'string' || item.model === '') {
      throw new Error(`第 ${index + 1} 个模型缺少 model 字段`);
    }
    return {
      id: item.id,
      name: typeof item.name === 'string' && item.name !== '' ? item.name : item.model,
      model: item.model,
      baseUrl: json.baseUrl as string,
      apiKey: json.apiKey as string,
      family: typeof item.family === 'string' && item.family !== '' ? item.family : undefined,
    };
  });
}

// 加载模型列表：优先 data/models.json（运行时覆盖），否则用构建时内置的配置
export function loadModels() {
  const overridePath = path.join(DATA_DIR, 'models.json');
  if (existsSync(overridePath)) {
    try {
      return parseModelsConfig(JSON.parse(readFileSync(overridePath, 'utf8')));
    } catch (error) {
      throw new Error(`运行时模型配置 ${overridePath} 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return parseModelsConfig(embeddedModelsJson);
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

export type VisionCheckResult = { ok: true; bbox: number[] } | { ok: false; reason: string };

// 从模型回复里提取 bbox JSON 并校验是否在测试图范围内
export function parseVisionCheckResponse(content: string): VisionCheckResult {
  const jsonMatch = content.match(/\{[^{}]*"bbox"[^{}]*\}/);
  if (!jsonMatch) {
    return { ok: false, reason: '回复中没有找到 bbox JSON' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'bbox JSON 无法解析' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.bbox) || parsed.bbox.length !== 4) {
    return { ok: false, reason: 'bbox 必须是 4 个数字的数组' };
  }
  const bbox = parsed.bbox;
  if (!bbox.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ok: false, reason: 'bbox 必须是 4 个数字的数组' };
  }
  const [x1, y1, x2, y2] = bbox;
  if (x1 < 0 || y1 < 0 || x2 > VISION_CHECK_WIDTH || y2 > VISION_CHECK_HEIGHT) {
    return { ok: false, reason: `bbox 超出图片范围（${VISION_CHECK_WIDTH}x${VISION_CHECK_HEIGHT}）` };
  }
  if (x2 <= x1 || y2 <= y1) {
    return { ok: false, reason: 'bbox 面积为零' };
  }
  return { ok: true, bbox };
}

const VISION_CHECK_PROMPT =
  '这是一张网页截图，画面中央有一个写着「确定按钮」的蓝色按钮。请定位这个按钮，只回复 JSON，格式：{"bbox": [x1, y1, x2, y2]}，坐标为像素值。';

async function loadVisionCheckImage() {
  const pngPath = path.join(import.meta.dir, '../../resources/vision-check.png');
  const buffer = await Bun.file(pngPath).arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// 视觉自检：给模型发一张带按钮的测试图，验证它能否返回可解析的元素坐标
// 这是模型能否用于 UI 自动化的分水岭：能看图不代表能返回坐标
export async function checkModelVision(
  model: ModelConfig,
  options: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; message: string }> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  try {
    const imageBase64 = await loadVisionCheckImage();
    const response = await fetch(`${model.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_CHECK_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, message: `接口返回 ${response.status}：${body.slice(0, 200)}` };
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    const result = parseVisionCheckResponse(content);
    if (result.ok) {
      return { ok: true, message: `视觉能力正常，定位坐标 [${result.bbox.join(', ')}]` };
    }
    return { ok: false, message: `模型无法用于 UI 自动化：${result.reason}` };
  } catch (error) {
    return { ok: false, message: `自检请求失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
