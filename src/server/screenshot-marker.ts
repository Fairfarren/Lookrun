import sharp from 'sharp';

const CLICK_ACTIONS = new Set(['aiTap', 'aiRightClick']);
const MARKER_COLOR = '#ff2d2d';
const BOX_PADDING = 20;
const MIN_BOX_WIDTH = 120;
const MIN_BOX_HEIGHT = 80;
const BOX_EDGE_MARGIN = 6;

interface TargetRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface ClickTarget {
    center: [number, number];
    rect?: TargetRect;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function validBox(value: Record<string, unknown>): TargetRect | undefined {
    const { left, top, width, height } = value;
    if (!isFiniteNumber(left) || !isFiniteNumber(top)) {
        return undefined;
    }
    if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
        return undefined;
    }
    return { left, top, width, height };
}

function validRect(value: unknown): TargetRect | undefined {
    return isRecord(value) ? validBox(value) : undefined;
}

function validCenter(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length < 2) {
        return null;
    }
    const [x, y] = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        return null;
    }
    return [x, y];
}

export function clickTargetForStep(action: string, aiResult: unknown): ClickTarget | null {
    if (!CLICK_ACTIONS.has(action) || !isRecord(aiResult) || !isRecord(aiResult.element)) {
        return null;
    }
    const center = validCenter(aiResult.element.center);
    if (!center) {
        return null;
    }
    const rect = validRect(aiResult.element.rect);
    return rect ? { center, rect } : { center };
}

function markerFits(input: { width: number; height: number; x: number; y: number }) {
    const { width, height, x, y } = input;
    return 0 <= x && x < width && 0 <= y && y < height;
}

function clampBox(input: { size: number; center: number; minSize: number; content: number }) {
    const { size, center, minSize, content } = input;
    const boxSize = Math.min(
        size - BOX_EDGE_MARGIN * 2,
        Math.max(minSize, content + BOX_PADDING * 2),
    );
    const start = Math.min(
        size - BOX_EDGE_MARGIN - boxSize,
        Math.max(BOX_EDGE_MARGIN, Math.round(center - boxSize / 2)),
    );
    return { start, size: boxSize };
}

export async function markClickOnScreenshot(screenshot: Buffer, target: ClickTarget) {
    const image = sharp(screenshot);
    const { width, height } = await image.metadata();
    const [x, y] = target.center.map(Math.round);
    if (!width || !height || !markerFits({ width, height, x, y })) {
        return screenshot;
    }
    const boxWidth = clampBox({
        size: width,
        center: x,
        minSize: MIN_BOX_WIDTH,
        content: target.rect?.width ?? 0,
    });
    const boxHeight = clampBox({
        size: height,
        center: y,
        minSize: MIN_BOX_HEIGHT,
        content: target.rect?.height ?? 0,
    });
    const boxLeft = boxWidth.start;
    const boxTop = boxHeight.start;
    const marker = Buffer.from(`
		<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<rect x="${boxLeft}" y="${boxTop}" width="${boxWidth.size}" height="${boxHeight.size}" rx="12" fill="${MARKER_COLOR}" fill-opacity="0.14" stroke="white" stroke-width="12" />
			<rect x="${boxLeft}" y="${boxTop}" width="${boxWidth.size}" height="${boxHeight.size}" rx="12" fill="none" stroke="${MARKER_COLOR}" stroke-width="6" />
			<circle cx="${x}" cy="${y}" r="27" fill="none" stroke="white" stroke-width="8" opacity="0.95" />
			<circle cx="${x}" cy="${y}" r="23" fill="${MARKER_COLOR}" fill-opacity="0.2" stroke="${MARKER_COLOR}" stroke-width="5" />
			<circle cx="${x}" cy="${y}" r="6" fill="${MARKER_COLOR}" stroke="white" stroke-width="3" />
		</svg>
	`);

    return image.composite([{ input: marker }]).toBuffer();
}
