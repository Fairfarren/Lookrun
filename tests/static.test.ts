import { expect, test } from "bun:test";

test("开发态加载静态资源模块时不依赖已构建的前端文件", async () => {
	const staticModule = await import("../src/server/static");

	expect(staticModule.registerStatic).toBeFunction();
});
