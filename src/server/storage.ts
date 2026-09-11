import type { Database } from 'bun:sqlite';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { countRuns } from './db';

// 递归统计目录下所有文件大小，目录不存在返回 0
export function dirSizeBytes(dir: string): number {
    if (!existsSync(dir)) {
        return 0;
    }
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            total += dirSizeBytes(full);
        } else if (entry.isFile()) {
            total += statSync(full).size;
        }
    }
    return total;
}

function dbFilesSize(dbPath: string) {
    // SQLite 主库文件 + WAL/SHM 伴随文件
    return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].reduce(
        (total, file) => total + (existsSync(file) ? statSync(file).size : 0),
        0,
    );
}

export function storageStats(
    db: Database,
    paths: { dbPath: string; screenshotDir: string; reportDir: string },
) {
    const screenshotsBytes = dirSizeBytes(paths.screenshotDir);
    const reportsBytes = dirSizeBytes(paths.reportDir);
    const databaseBytes = dbFilesSize(paths.dbPath);
    return {
        screenshotsBytes,
        reportsBytes,
        databaseBytes,
        totalBytes: screenshotsBytes + reportsBytes + databaseBytes,
        runCount: countRuns(db),
    };
}

function emptyDir(dir: string) {
    if (!existsSync(dir)) {
        return;
    }
    for (const entry of readdirSync(dir)) {
        rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
}

// 清空全部历史运行：runs/run_steps 记录 + 截图目录 + Midscene 报告目录内容
// 任务和变量不受影响；返回删除的运行数与释放的字节数
export function cleanupAllRuns(db: Database, screenshotDir: string, reportDir: string) {
    const freedBytes = dirSizeBytes(screenshotDir) + dirSizeBytes(reportDir);
    const deletedRuns = countRuns(db);

    db.prepare('DELETE FROM run_steps').run();
    db.prepare('DELETE FROM runs').run();
    emptyDir(screenshotDir);
    emptyDir(reportDir);

    return { deletedRuns, freedBytes };
}
