import { getConnectedDevicesWithDetails } from "@midscene/android";
import {
	createAndroidAppLauncher,
	createAndroidDeviceChecker,
	createAndroidDeviceLister,
	detectAdbPath,
	parseAndroidLauncherPackages,
	parseAndroidScreenSize,
} from "./android";

const APP_LIST_OPEN_DELAY_MS = 500;
const APP_LIST_SCROLL_DELAY_MS = 400;
const APP_OPEN_DELAY_MS = 800;
const APP_LIST_UI_PATH = "/sdcard/test-web-use-ai-app-list.xml";

interface AdbCommandInput {
	deviceId: string;
	args: string[];
}

async function runAdbCommand(input: AdbCommandInput) {
	const subprocess = Bun.spawn(
		[requireAdbPath(), "-s", input.deviceId, ...input.args],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		subprocess.exited,
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || stdout.trim() || "ADB 命令执行失败");
	}
	return stdout;
}

export function createDeviceAndroidAppLauncher(input: {
	deviceId: string;
	directLaunch: (target: string) => Promise<unknown>;
}) {
	let screenSize: ReturnType<typeof parseAndroidScreenSize> | null = null;
	const run = (args: string[]) =>
		runAdbCommand({ deviceId: input.deviceId, args });
	const getScreenSize = async () => {
		screenSize ??= parseAndroidScreenSize(await run(["shell", "wm", "size"]));
		return screenSize;
	};
	const swipeUp = async () => {
		const { width, height } = await getScreenSize();
		await run([
			"shell",
			"input",
			"swipe",
			String(Math.round(width / 2)),
			String(Math.round(height * 0.85)),
			String(Math.round(width / 2)),
			String(Math.round(height * 0.25)),
			"300",
		]);
	};

	return createAndroidAppLauncher({
		directLaunch: input.directLaunch,
		prepareAppList: async () => {
			await run(["shell", "input", "keyevent", "KEYCODE_HOME"]);
			await Bun.sleep(APP_LIST_OPEN_DELAY_MS);
			await swipeUp();
			await Bun.sleep(APP_LIST_OPEN_DELAY_MS);
		},
		readUi: async () => {
			await run(["shell", "uiautomator", "dump", APP_LIST_UI_PATH]);
			return run(["exec-out", "cat", APP_LIST_UI_PATH]);
		},
		scrollAppList: async () => {
			await swipeUp();
			await Bun.sleep(APP_LIST_SCROLL_DELAY_MS);
		},
		tap: ({ x, y }) =>
			run(["shell", "input", "tap", String(x), String(y)]),
		waitAfterTap: () => Bun.sleep(APP_OPEN_DELAY_MS),
	});
}

function requireAdbPath() {
	const adbPath = detectAdbPath();
	if (!adbPath) {
		throw new Error("未找到 ADB，请使用包含 platform-tools 的完整程序包");
	}
	return adbPath;
}

const listFromProvider = createAndroidDeviceLister(async () => {
	return getConnectedDevicesWithDetails({ androidAdbPath: requireAdbPath() });
});

export async function listAndroidDevices() {
	return listFromProvider();
}

export async function listAndroidApps(deviceId: string) {
	const output = await runAdbCommand({
		deviceId,
		args: [
			"shell",
			"cmd",
			"package",
			"query-activities",
			"--components",
			"-a",
			"android.intent.action.MAIN",
			"-c",
			"android.intent.category.LAUNCHER",
		],
	});
	return parseAndroidLauncherPackages(output);
}

export const checkAndroidDevice = createAndroidDeviceChecker(listAndroidDevices);

export function androidAdbPath() {
	return requireAdbPath();
}
