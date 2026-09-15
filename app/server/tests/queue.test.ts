import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '@server/db';
import {
    cancelQueueItem,
    enqueue,
    listQueue,
    moveQueueItem,
    nextPending,
    requeueInterrupted,
    setQueueStatus,
} from '@server/services/queue';

let db: Database;
let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'twai-queue-'));
    db = createDb(path.join(tempDir, 'test.db'));
});

afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

function add(name: string) {
    return enqueue(db, {
        taskId: 1,
        taskName: name,
        modelId: 'kimi',
        model: 'kimi-k2.7-code:cloud',
    });
}

describe('enqueue / nextPending', () => {
    test('入队自动分配递增 position，按 position 取下一个', () => {
        const a = add('A');
        const b = add('B');
        const c = add('C');

        expect(a.position).toBe(1);
        expect(b.position).toBe(2);
        expect(c.position).toBe(3);
        expect(nextPending(db)?.taskName).toBe('A');
    });

    test('listQueue 只返回 pending 和 running，按 position 排序', () => {
        const a = add('A');
        add('B');
        add('C');
        setQueueStatus(db, a.id, 'done');

        const items = listQueue(db);
        expect(items.map((item) => item.taskName)).toEqual(['B', 'C']);
    });
});

describe('moveQueueItem', () => {
    test('上移/下移交换相邻 pending 的顺序', () => {
        add('A');
        const b = add('B');
        add('C');

        moveQueueItem(db, b.id, 'up');
        expect(listQueue(db).map((item) => item.taskName)).toEqual(['B', 'A', 'C']);

        moveQueueItem(db, b.id, 'up');
        expect(listQueue(db)[0].taskName).toBe('B');

        moveQueueItem(db, b.id, 'down');
        moveQueueItem(db, b.id, 'down');
        expect(listQueue(db).map((item) => item.taskName)).toEqual(['A', 'C', 'B']);
    });

    test('已经在顶部的上移是空操作', () => {
        const a = add('A');
        moveQueueItem(db, a.id, 'up');
        expect(listQueue(db)[0].taskName).toBe('A');
    });

    test('running 状态的条目不能移动', () => {
        const a = add('A');
        const b = add('B');
        setQueueStatus(db, a.id, 'running');

        moveQueueItem(db, b.id, 'up');
        expect(listQueue(db).map((item) => item.taskName)).toEqual(['A', 'B']);
    });
});

describe('cancelQueueItem / requeueInterrupted', () => {
    test('pending 条目可取消，取消后不再被取出', () => {
        const a = add('A');
        add('B');
        cancelQueueItem(db, a.id);

        expect(nextPending(db)?.taskName).toBe('B');
    });

    test('程序重启时 running 条目恢复为 pending', () => {
        const a = add('A');
        const b = add('B');
        setQueueStatus(db, a.id, 'running');

        requeueInterrupted(db);

        const items = listQueue(db);
        expect(items.every((item) => item.status === 'pending')).toBe(true);
        expect(nextPending(db)?.taskName).toBe('A');
        expect(items[0].id).toBe(a.id);
        expect(items[1].id).toBe(b.id);
    });
});
