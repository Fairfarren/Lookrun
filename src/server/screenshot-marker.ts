import sharp from "sharp";

const CLICK_ACTIONS = new Set(["aiTap", "aiRightClick"]);
const MARKER_COLOR = "#ff2d2d";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clickPointForStep(
	action: string,
	aiResult: unknown,
): [number, number] | null {
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
	return [x, y];
}

export async function markClickOnScreenshot(
	screenshot: Buffer,
	point: [number, number],
) {
	const image = sharp(screenshot);
	const { width, height } = await image.metadata();
	const [x, y] = point.map(Math.round);
	if (!width || !height || x < 0 || width <= x || y < 0 || height <= y) {
		return screenshot;
	}
	const marker = Buffer.from(`
		<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<circle cx="${x}" cy="${y}" r="27" fill="none" stroke="white" stroke-width="8" opacity="0.95" />
			<circle cx="${x}" cy="${y}" r="23" fill="${MARKER_COLOR}" fill-opacity="0.2" stroke="${MARKER_COLOR}" stroke-width="5" />
			<circle cx="${x}" cy="${y}" r="6" fill="${MARKER_COLOR}" stroke="white" stroke-width="3" />
		</svg>
	`);

	return image.composite([{ input: marker }]).toBuffer();
}
