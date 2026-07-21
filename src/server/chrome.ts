import { existsSync } from "node:fs";
import path from "node:path";

export interface ChromeDetection {
	path: string | null;
	// env 环境变量 / detected 固定路径 / registry 注册表(Win) / spotlight Spotlight(Mac) / which which命令(Linux) / none 未找到
	source: "env" | "detected" | "registry" | "spotlight" | "which" | "none";
}

function candidatePaths(): string[] {
	if (process.platform === "darwin") {
		return [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			path.join(
				process.env.HOME ?? "",
				"Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			),
		];
	}
	if (process.platform === "win32") {
		const prefixes = [
			process.env.PROGRAMFILES,
			process.env["PROGRAMFILES(X86)"],
			process.env.LOCALAPPDATA,
		].filter((p): p is string => Boolean(p));
		return prefixes.map((p) =>
			path.join(p, "Google/Chrome/Application/chrome.exe"),
		);
	}
	return [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium-browser",
	];
}

// 解析 Windows `reg query ... /ve` 输出，提取 REG_SZ 后面的 chrome.exe 路径
export function parseWindowsRegOutput(output: string): string | null {
	// 默认值名在中文/英文系统里不同（"(默认)" vs "(Default)"），但 REG_SZ 关键字稳定
	const match = output.match(/REG_SZ\s+(.+?)(?:\r?\n|$)/);
	if (!match) {
		return null;
	}
	const p = match[1].trim();
	return p === "" ? null : p;
}

// 解析 macOS `mdfind` 输出：取第一个 Google Chrome.app 并拼上可执行文件路径
export function parseMdfindOutput(output: string): string | null {
	const lines = output
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	for (const line of lines) {
		if (line.endsWith("Google Chrome.app")) {
			return path.join(line, "Contents/MacOS/Google Chrome");
		}
	}
	return null;
}

// 解析 Linux `which` 输出：取第一行存在的可执行文件路径
export function parseWhichOutput(output: string): string | null {
	const lines = output
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return lines[0] ?? null;
}

// 固定路径都没命中时，回退到系统命令查询（注册表/Spotlight/which）
// 用 spawnSync 同步执行，探测只在启动/运行任务时各一次，阻塞几十毫秒可接受，
// 保持 detectChrome 同步签名，避免改动三处调用方
function queryBySystem(): ChromeDetection {
	try {
		if (process.platform === "win32") {
			// 三处可能的注册表位置：64位 HKLM、32位重定向 HKLM、当前用户 HKCU
			const keys = [
				"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
				"HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
				"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
			];
			for (const key of keys) {
				const r = Bun.spawnSync(["reg", "query", key, "/ve"]);
				const out = r.stdout?.toString() ?? "";
				const p = parseWindowsRegOutput(out);
				if (p && existsSync(p)) {
					return { path: p, source: "registry" };
				}
			}
			return { path: null, source: "none" };
		}
		if (process.platform === "darwin") {
			const r = Bun.spawnSync([
				"mdfind",
				"kMDItemFSName == 'Google Chrome.app'",
			]);
			const out = r.stdout?.toString() ?? "";
			const p = parseMdfindOutput(out);
			if (p && existsSync(p)) {
				return { path: p, source: "spotlight" };
			}
			return { path: null, source: "none" };
		}
		// Linux：which 一次查多个候选名，取第一个存在的
		const r = Bun.spawnSync([
			"sh",
			"-c",
			"which google-chrome google-chrome-stable chromium chromium-browser 2>/dev/null",
		]);
		const out = r.stdout?.toString() ?? "";
		const p = parseWhichOutput(out);
		if (p && existsSync(p)) {
			return { path: p, source: "which" };
		}
		return { path: null, source: "none" };
	} catch {
		return { path: null, source: "none" };
	}
}

// 探测系统 Chrome：环境变量 → 固定安装路径 → 系统命令查询（注册表/Spotlight/which）
// 三级回退，标准安装路径找不到时也能自动发现，无需运营手动配置
export function detectChrome(): ChromeDetection {
	const envPath = process.env.CHROME_PATH ?? process.env.MIDSCENE_CHROME_PATH;
	if (envPath && existsSync(envPath)) {
		return { path: envPath, source: "env" };
	}
	for (const p of candidatePaths()) {
		if (existsSync(p)) {
			return { path: p, source: "detected" };
		}
	}
	return queryBySystem();
}
