import sharp from "sharp";

const CLICK_ACTIONS = new Set(["aiTap", "aiRightClick"]);
const MARKER_COLOR = "#ff2d2d";
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
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRect(value: unknown): TargetRect | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const { left, top, width, height } = value;
	if (
		typeof left !== "number" ||
		typeof top !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		![left, top, width, height].every(Number.isFinite) ||
		width <= 0 ||
		height <= 0
	) {
		return undefined;
	}
	return { left, top, width, height };
}

export function clickTargetForStep(
	action: string,
	aiResult: unknown,
): ClickTarget | null {
	if (!CLICK_ACTIONS.has(action) || !isRecord(aiResult)) {
		return null;
	}
	const element = aiResult.element;
	if (!isRecord(element) || !Array.isArray(element.center)) {
		return null;
	}
	const [x, y] = element.center;
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		!Number.isFinite(x) ||
		!Number.isFinite(y)
	) {
		return null;
	}
	const rect = validRect(element.rect);
	return rect ? { center: [x, y], rect } : { center: [x, y] };
}

export async function markClickOnScreenshot(
	screenshot: Buffer,
	target: ClickTarget,
) {
	const image = sharp(screenshot);
	const { width, height } = await image.metadata();
	const [x, y] = target.center.map(Math.round);
	if (!width || !height || x < 0 || width <= x || y < 0 || height <= y) {
		return screenshot;
	}
	const boxWidth = Math.min(
		width - BOX_EDGE_MARGIN * 2,
		Math.max(MIN_BOX_WIDTH, (target.rect?.width ?? 0) + BOX_PADDING * 2),
	);
	const boxHeight = Math.min(
		height - BOX_EDGE_MARGIN * 2,
		Math.max(MIN_BOX_HEIGHT, (target.rect?.height ?? 0) + BOX_PADDING * 2),
	);
	const boxLeft = Math.min(
		width - BOX_EDGE_MARGIN - boxWidth,
		Math.max(BOX_EDGE_MARGIN, Math.round(x - boxWidth / 2)),
	);
	const boxTop = Math.min(
		height - BOX_EDGE_MARGIN - boxHeight,
		Math.max(BOX_EDGE_MARGIN, Math.round(y - boxHeight / 2)),
	);
	const marker = Buffer.from(`
		<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<rect x="${boxLeft}" y="${boxTop}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="${MARKER_COLOR}" fill-opacity="0.14" stroke="white" stroke-width="12" />
			<rect x="${boxLeft}" y="${boxTop}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="none" stroke="${MARKER_COLOR}" stroke-width="6" />
			<circle cx="${x}" cy="${y}" r="27" fill="none" stroke="white" stroke-width="8" opacity="0.95" />
			<circle cx="${x}" cy="${y}" r="23" fill="${MARKER_COLOR}" fill-opacity="0.2" stroke="${MARKER_COLOR}" stroke-width="5" />
			<circle cx="${x}" cy="${y}" r="6" fill="${MARKER_COLOR}" stroke="white" stroke-width="3" />
		</svg>
	`);

	return image.composite([{ input: marker }]).toBuffer();
}
