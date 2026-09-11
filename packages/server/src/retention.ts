import type { Database } from 'bun:sqlite';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

// 清理超出保留数量的旧运行：删除 runs / run_steps 记录和对应的截图目录
// 返回被删除的运行 id 列表
export function cleanupOldRuns(db: Database, screenshotDir: string, keepCount: number) {
    const stale = db
        .prepare('SELECT id FROM runs ORDER BY id DESC LIMIT -1 OFFSET ?')
        .all(keepCount) as {
        id: number;
    }[];
    if (stale.length === 0) {
        return [];
    }

    const ids = stale.map((row) => row.id).sort((a, b) => a - b);
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`DELETE FROM run_steps WHERE run_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
        const dir = path.join(screenshotDir, String(id));
        if (existsSync(dir)) {
            rmSync(dir, { recursive: true, force: true });
        }
    }
    return ids;
}
