import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countRuns, createDb, insertRun, insertStep } from '../src/db';
import { cleanupAllRuns, dirSizeBytes, storageStats } from '../src/services/storage';

let tempDir: string;
let db: Database;

beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'twai-storage-'));
    db = createDb(path.join(tempDir, 'app.db'));
});

afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, size: number) {
    const full = path.join(tempDir, relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, Buffer.alloc(size, 1));
}

describe('dirSizeBytes', () => {
    test('递归统计目录下所有文件大小', () => {
        writeFile('a/1.jpg', 100);
        writeFile('a/b/2.jpg', 200);
        writeFile('a/b/c/3.jpg', 300);

        expect(dirSizeBytes(path.join(tempDir, 'a'))).toBe(600);
    });

    test('目录不存在时返回 0', () => {
        expect(dirSizeBytes(path.join(tempDir, 'not-exist'))).toBe(0);
    });
});

describe('storageStats', () => {
    test('分项返回截图/报告/数据库占用与运行数', () => {
        writeFile('screenshots/1/0-before.jpg', 1024 * 1024);
        writeFile('midscene-report/r1/index.html', 2048);
        insertRun(db, { taskId: 1, taskName: 't', model: 'm' });

        const stats = storageStats(db, {
            dbPath: path.join(tempDir, 'app.db'),
            screenshotDir: path.join(tempDir, 'screenshots'),
            reportDir: path.join(tempDir, 'midscene-report'),
        });

        expect(stats.screenshotsBytes).toBe(1024 * 1024);
        expect(stats.reportsBytes).toBe(2048);
        expect(stats.databaseBytes).toBeGreaterThan(0);
        expect(stats.totalBytes).toBe(
            stats.screenshotsBytes + stats.reportsBytes + stats.databaseBytes,
        );
        expect(stats.runCount).toBe(1);
    });
});

describe('cleanupAllRuns', () => {
    test('清空运行记录与步骤、删除截图和报告目录内容，任务不受影响', () => {
        const run = insertRun(db, { taskId: 1, taskName: 't', model: 'm' });
        insertStep(db, {
            runId: run.id,
            stepIndex: 0,
            stepName: 's',
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
        writeFile('screenshots/1/0-before.jpg', 500);
        writeFile('midscene-report/r1/index.html', 300);
        db.prepare(
            'INSERT INTO tasks (name, yaml, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ).run('任务', 'yaml', 't', 't');

        const result = cleanupAllRuns(
            db,
            path.join(tempDir, 'screenshots'),
            path.join(tempDir, 'midscene-report'),
        );

        expect(result.deletedRuns).toBe(1);
        expect(result.freedBytes).toBe(800);
        expect(countRuns(db)).toBe(0);
        expect(db.prepare('SELECT COUNT(*) AS c FROM run_steps').get()).toEqual({
            c: 0,
        });
        // 任务还在
        expect(db.prepare('SELECT COUNT(*) AS c FROM tasks').get()).toEqual({
            c: 1,
        });
        // 目录本身保留，内容清空
        expect(existsSync(path.join(tempDir, 'screenshots'))).toBe(true);
        expect(dirSizeBytes(path.join(tempDir, 'screenshots'))).toBe(0);
        expect(dirSizeBytes(path.join(tempDir, 'midscene-report'))).toBe(0);
    });
});

test('清理不存在的截图和报告目录仍能清空历史记录', () => {
    insertRun(db, { taskId: null, taskName: '记录', model: '模型' });

    cleanupAllRuns(db, path.join(tempDir, 'missing-shots'), path.join(tempDir, 'missing-reports'));

    expect(countRuns(db)).toBe(0);
});
