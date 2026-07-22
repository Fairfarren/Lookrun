import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
	clickTargetForStep,
	markClickOnScreenshot,
} from "../src/server/screenshot-marker";

const locatedElement = {
	action: "Tap - 登录按钮",
	element: {
		center: [50, 40],
	},
};

describe("clickTargetForStep", () => {
	test("普通点击返回模型定位的中心坐标和元素矩形", () => {
		const result = clickTargetForStep("aiTap", {
			...locatedElement,
			element: {
				center: [50, 40],
				rect: { left: 30, top: 25, width: 40, height: 30 },
			},
		});

		expect(result).toEqual({
			center: [50, 40],
			rect: { left: 30, top: 25, width: 40, height: 30 },
		});
	});

	test("右键点击返回模型定位的中心坐标", () => {
		expect(clickTargetForStep("aiRightClick", locatedElement)).toEqual({
			center: [50, 40],
		});
	});

	test("非点击步骤不返回标记坐标", () => {
		expect(clickTargetForStep("aiInput", locatedElement)).toBeNull();
	});

	test("非法中心坐标不返回标记坐标", () => {
		const invalidElement = {
			...locatedElement,
			element: { center: [Number.NaN, 40] },
		};

		expect(clickTargetForStep("aiTap", invalidElement)).toBeNull();
	});
});

describe("markClickOnScreenshot", () => {
	test("在点击中心绘制红色靶心", async () => {
		const screenshot = await sharp({
			create: {
				width: 100,
				height: 80,
				channels: 3,
				background: "white",
			},
		})
			.png()
			.toBuffer();

		const marked = await markClickOnScreenshot(screenshot, {
			center: [50, 40],
		});
		const { data } = await sharp(marked)
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const centerPixel = data.subarray((40 * 100 + 50) * 3, (40 * 100 + 50) * 3 + 3);

		expect(Array.from(centerPixel)).toEqual([255, 45, 45]);
	});

	test("在点击元素外绘制红色矩形边框", async () => {
		const screenshot = await sharp({
			create: {
				width: 240,
				height: 180,
				channels: 3,
				background: "white",
			},
		})
			.png()
			.toBuffer();

		const marked = await markClickOnScreenshot(screenshot, {
			center: [120, 90],
			rect: { left: 100, top: 75, width: 40, height: 30 },
		});
		const { data } = await sharp(marked)
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const borderPixel = data.subarray((90 * 240 + 60) * 3, (90 * 240 + 60) * 3 + 3);

		expect(Array.from(borderPixel)).toEqual([255, 45, 45]);
	});
});
