import { existsSync } from 'node:fs';
import path from 'node:path';

export interface ChromeDetection {
  path: string | null;
  // 环境变量指定 / 常见路径探测 / 未找到
  source: 'env' | 'detected' | 'none';
}

function candidatePaths(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(process.env.HOME ?? '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  }
  if (process.platform === 'win32') {
    const prefixes = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(
      (p): p is string => Boolean(p),
    );
    return prefixes.map((p) => path.join(p, 'Google/Chrome/Application/chrome.exe'));
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser'];
}

// 探测系统 Chrome：优先环境变量，其次平台常见安装路径
export function detectChrome(): ChromeDetection {
  const envPath = process.env.CHROME_PATH ?? process.env.MIDSCENE_CHROME_PATH;
  if (envPath && existsSync(envPath)) {
    return { path: envPath, source: 'env' };
  }
  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      return { path: p, source: 'detected' };
    }
  }
  return { path: null, source: 'none' };
}
