import { $ } from "bun";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import path from "node:path";

const FFMPEG_INSTALLER_PACKAGE_PATH =
	"node_modules/@ffmpeg-installer/ffmpeg/package.json";
const SCRCPY_SERVER_PATH = "node_modules/@midscene/android/bin/scrcpy-server";

export function ffmpegPackageForPlatform(platformKey: string) {
	const packageName = `@ffmpeg-installer/${platformKey}`;
	const packageJson = JSON.parse(
		readFileSync(FFMPEG_INSTALLER_PACKAGE_PATH, "utf8"),
	) as { optionalDependencies?: Record<string, string> };
	const version = packageJson.optionalDependencies?.[packageName];
	if (!version) {
		throw new Error(`不支持为 ${platformKey} 打包 FFmpeg`);
	}
	return {
		packageName,
		version,
		binaryName: platformKey.startsWith("win32") ? "ffmpeg.exe" : "ffmpeg",
	};
}

async function downloadFfmpeg(
	outDir: string,
	packageInfo: ReturnType<typeof ffmpegPackageForPlatform>,
) {
	const packageDirName = packageInfo.packageName.replace(/^@[^/]+\//, "");
	const tarballName = `${packageDirName}-${packageInfo.version}.tgz`;
	const url = `https://registry.npmjs.org/${packageInfo.packageName}/-/${tarballName}`;
	const tempDir = path.join(outDir, ".runtime-assets-download");
	const tarballPath = path.join(tempDir, tarballName);
	rmSync(tempDir, { recursive: true, force: true });
	mkdirSync(tempDir, { recursive: true });
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`下载 ${packageInfo.packageName}@${packageInfo.version} 失败：HTTP ${response.status}`,
			);
		}
		await Bun.write(tarballPath, Buffer.from(await response.arrayBuffer()));
		await $`tar xzf ${tarballPath} -C ${tempDir} --strip-components=1`;
		const binaryPath = path.join(tempDir, packageInfo.binaryName);
		if (!existsSync(binaryPath)) {
			throw new Error(`FFmpeg 压缩包中缺少 ${packageInfo.binaryName}`);
		}
		return binaryPath;
	} catch (error) {
		rmSync(tempDir, { recursive: true, force: true });
		throw error;
	}
}

export async function installRuntimeAssets(outDir: string, platformKey: string) {
	const packageInfo = ffmpegPackageForPlatform(platformKey);
	const targetDir = path.join(outDir, "runtime-tools");
	rmSync(targetDir, { recursive: true, force: true });
	mkdirSync(targetDir, { recursive: true });

	const localFfmpegPath = path.join(
		"node_modules",
		"@ffmpeg-installer",
		platformKey,
		packageInfo.binaryName,
	);
	const downloaded = !existsSync(localFfmpegPath);
	const ffmpegSource = downloaded
		? await downloadFfmpeg(outDir, packageInfo)
		: localFfmpegPath;
	cpSync(ffmpegSource, path.join(targetDir, packageInfo.binaryName));
	cpSync(SCRCPY_SERVER_PATH, path.join(targetDir, "scrcpy-server"));
	if (downloaded) {
		rmSync(path.join(outDir, ".runtime-assets-download"), {
			recursive: true,
			force: true,
		});
	}
	console.log(
		`运行时资源已安装：${packageInfo.packageName}@${packageInfo.version} + scrcpy-server`,
	);
}
