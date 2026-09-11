import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countRuns, createDb, insertRun, insertStep, listRuns } from '../src/db';
import { cleanupOldRuns } from '../src/services/retention';

let db: Database;
let tempDir: string;
let screenshotDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'twai-test-'));
    screenshotDir = path.join(tempDir, 'screenshots');
    db = createDb(path.join(tempDir, 'test.db'));
});

afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

function createRunWithShots(index: number) {
    const run = insertRun(db, { taskId: null, taskName: `任务${index}`, model: 'm' });
    const dir = path.join(screenshotDir, String(run.id));
    mkdirSync(dir, { recursive: true });
    insertStep(db, {
        runId: run.id,
        stepIndex: 0,
        stepName: '步骤',
        action: 'aiTap',
        url: null,
        prompt: null,
        aiResult: null,
        shotBefore: null,
        shotAfter: null,
        durationMs: 1,
        tokenInput: 0,
        tokenOutput: 0,
        status: 'success',
        error: null,
    });
    return run.id;
}

describe('cleanupOldRuns', () => {
    test('超出保留数量的旧运行被删除，步骤和截图目录一并清理', () => {
        const ids = [1, 2, 3, 4, 5].map(createRunWithShots);

        const deleted = cleanupOldRuns(db, screenshotDir, 2);

        expect(deleted).toEqual([ids[0], ids[1], ids[2]]);
        expect(countRuns(db)).toBe(2);
        // 最新的两个保留
        expect(listRuns(db, { limit: 10, offset: 0 }).map((r) => r.id)).toEqual([ids[4], ids[3]]);
        // 旧运行的截图目录被删除，保留的还在
        expect(existsSync(path.join(screenshotDir, String(ids[0])))).toBe(false);
        expect(existsSync(path.join(screenshotDir, String(ids[4])))).toBe(true);
        // 步骤被级联删除
        expect(db.prepare('SELECT COUNT(*) AS c FROM run_steps').get()).toEqual({ c: 2 });
    });

    test('运行数未超限时不删除任何内容', () => {
        createRunWithShots(1);
        createRunWithShots(2);

        expect(cleanupOldRuns(db, screenshotDir, 100)).toEqual([]);
        expect(countRuns(db)).toBe(2);
    });

    test('截图目录不存在时不报错', () => {
        insertRun(db, { taskId: null, taskName: 'x', model: 'm' });
        insertRun(db, { taskId: null, taskName: 'y', model: 'm' });

        expect(cleanupOldRuns(db, screenshotDir, 1)).toHaveLength(1);
        expect(countRuns(db)).toBe(1);
    });
});
