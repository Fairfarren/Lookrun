import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, insertTask } from '@server/db';
import {
    createQueue,
    deleteQueue,
    getQueue,
    listQueues,
    updateQueue,
} from '@server/services/queue-defs';

let db: Database;
let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'twai-qdef-'));
    db = createDb(path.join(tempDir, 'test.db'));
    insertTask(db, {
        name: '任务A',
        yaml: 'target: https://a.com\ntasks:\n  - name: a\n    flow:\n      - ai: x',
    });
    insertTask(db, {
        name: '任务B',
        yaml: 'target: https://b.com\ntasks:\n  - name: b\n    flow:\n      - ai: x',
    });
});

afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

describe('队列 CRUD', () => {
    test('创建队列并读取', () => {
        const q = createQueue(db, { name: '每日冒烟' });
        const got = getQueue(db, q.id);
        expect(got?.name).toBe('每日冒烟');
        expect(got?.items).toEqual([]);
    });

    test('列表按更新时间倒序', () => {
        const a = createQueue(db, { name: '队列A' });
        const b = createQueue(db, { name: '队列B' });
        expect(listQueues(db).map((q) => q.id)).toEqual([b.id, a.id]);
    });

    test('更新队列名和条目（全量替换）', () => {
        const q = createQueue(db, { name: '旧名' });
        updateQueue(db, q.id, {
            name: '新名',
            items: [
                { taskId: 1, modelId: 'kimi' },
                { taskId: 2, modelId: 'gemma4' },
            ],
        });
        const got = getQueue(db, q.id);
        expect(got?.name).toBe('新名');
        expect(got?.items).toHaveLength(2);
        expect(got?.items[0]).toMatchObject({
            taskId: 1,
            modelId: 'kimi',
            position: 1,
        });
        expect(got?.items[1]).toMatchObject({
            taskId: 2,
            modelId: 'gemma4',
            position: 2,
        });
    });

    test('再次更新替换旧条目', () => {
        const q = createQueue(db, { name: 'q' });
        updateQueue(db, q.id, {
            name: 'q',
            items: [{ taskId: 1, modelId: 'kimi' }],
        });
        updateQueue(db, q.id, {
            name: 'q',
            items: [{ taskId: 2, modelId: 'gemma4' }],
        });
        expect(getQueue(db, q.id)?.items).toHaveLength(1);
        expect(getQueue(db, q.id)?.items[0]).toMatchObject({ taskId: 2 });
    });

    test('删除队列连同条目', () => {
        const q = createQueue(db, { name: 'q' });
        updateQueue(db, q.id, {
            name: 'q',
            items: [{ taskId: 1, modelId: 'kimi' }],
        });
        deleteQueue(db, q.id);
        expect(getQueue(db, q.id)).toBeNull();
        expect(listQueues(db)).toHaveLength(0);
    });
});
