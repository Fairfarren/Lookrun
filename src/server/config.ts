import path from 'node:path';

export const SERVER_PORT = Number(process.env.SERVER_PORT) || 3877;

// 数据目录：打包后为可执行文件同级的 data/，开发时为项目根的 data/
// 判断依据：开发时 process.execPath 是 bun 本身，打包后是产物可执行文件
function resolveDataDir() {
  if (process.env.TEST_WEB_AI_DATA_DIR) {
    return process.env.TEST_WEB_AI_DATA_DIR;
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isBunRuntime = execName.startsWith('bun');
  const baseDir = isBunRuntime ? process.cwd() : path.dirname(process.execPath);
  return path.join(baseDir, 'data');
}

export const DATA_DIR = resolveDataDir();
export const DB_PATH = path.join(DATA_DIR, 'app.db');
export const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
export const REPORT_DIR = path.join(DATA_DIR, 'midscene-report');

// 历史记录最多保留的运行次数，超出后自动清理（含截图）
export const RUN_KEEP_COUNT = 100;
