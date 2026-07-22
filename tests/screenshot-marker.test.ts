import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
	clickPointForStep,
	markClickOnScreenshot,
} from "../src/server/screenshot-marker";

const locatedElement = {
	action: "Tap - 登录按钮",
	element: {
		center: [50, 40],
	},
};

describe("clickPointForStep", () => {
	test("普通点击返回模型定位的中心坐标", () => {
		expect(clickPointForStep("aiTap", locatedElement)).toEqual([50, 40]);
	});

	test("右键点击返回模型定位的中心坐标", () => {
		expect(clickPointForStep("aiRightClick", locatedElement)).toEqual([50, 40]);
	});

	test("非点击步骤不返回标记坐标", () => {
		expect(clickPointForStep("aiInput", locatedElement)).toBeNull();
	});

	test("非法中心坐标不返回标记坐标", () => {
		const invalidElement = {
			...locatedElement,
			element: { center: [Number.NaN, 40] },
		};

		expect(clickPointForStep("aiTap", invalidElement)).toBeNull();
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

		const marked = await markClickOnScreenshot(screenshot, [50, 40]);
		const { data } = await sharp(marked)
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const centerPixel = data.subarray((40 * 100 + 50) * 3, (40 * 100 + 50) * 3 + 3);

		expect(Array.from(centerPixel)).toEqual([255, 45, 45]);
	});
});
