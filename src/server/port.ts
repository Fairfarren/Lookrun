// 启动前自动清理被占用的端口：找到占用进程并杀掉，避免上一次实例残留导致启动失败
import { spawnSync } from "node:child_process";

// 解析 macOS/Linux 的 `lsof -ti :PORT` 输出，返回 PID 列表（每行一个数字）
export function parseLsofPids(output: string): number[] {
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
}

// 解析 Windows 的 `netstat -ano` 输出，只取 LISTENING 行末尾的 PID
// 行格式示例：`  TCP    0.0.0.0:3877           0.0.0.0:0              LISTENING       12345`
export function parseNetstatPids(output: string, port: number): number[] {
	const pids: number[] = [];
	for (const line of output.split("\n")) {
		// 端口后紧跟空白才算精确匹配，避免 3877 误匹配 38770
		const portMatch = line.includes(`:${port} `) || line.includes(`:${port}\t`);
		if (!portMatch || !line.includes("LISTENING")) {
			continue;
		}
		// PID 在行尾
		const match = line.match(/\s(\d+)\s*$/);
		if (match) {
			const pid = Number(match[1]);
			if (Number.isFinite(pid) && pid > 0) {
				pids.push(pid);
			}
		}
	}
	return pids;
}

// 查找占用指定端口的进程 PID（排除自己，避免误杀）
function findPortPids(port: number): number[] {
	const selfPid = process.pid;
	if (process.platform === "win32") {
		const r = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
		return parseNetstatPids(r.stdout ?? "", port).filter((p) => p !== selfPid);
	}
	// macOS/Linux：lsof -ti :PORT 直接返回 PID
	const r = spawnSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
	return parseLsofPids(r.stdout ?? "").filter((p) => p !== selfPid);
}

// 杀掉指定 PID（跨平台）
function killPid(pid: number) {
	const cmd =
		process.platform === "win32"
			? ["taskkill", "/F", "/PID", String(pid)]
			: ["kill", "-9", String(pid)];
	spawnSync(cmd[0], cmd.slice(1), { stdio: "ignore" });
}

// 检测端口是否已释放（用 lsof/netstat 再查一次）
function isPortFree(port: number): boolean {
	return findPortPids(port).length === 0;
}

// 启动前确保端口空闲：占用则杀掉占用进程，并等待端口释放
export function ensurePortFree(port: number): void {
	const pids = findPortPids(port);
	if (pids.length === 0) {
		return;
	}
	console.log(
		`端口 ${port} 被占用（PID: ${pids.join(", ")}），自动清理后启动...`,
	);
	for (const pid of pids) {
		killPid(pid);
	}
	// 等待端口释放，最多重试 30 次（约 3 秒）
	for (let i = 0; i < 30; i++) {
		if (isPortFree(port)) {
			return;
		}
		spawnSync("sleep", ["0.1"], { stdio: "ignore" });
	}
	console.warn(`端口 ${port} 清理后仍被占用，继续尝试启动`);
}