import type { Database } from 'bun:sqlite';

// 命名队列（可复用的任务集合）：用户定义一个队列，里面固定几个任务按顺序排好，
// 每天点一下「开始」就全部串行跑一遍。与运行时队列（run_queue）不同：
// 这里是定义（模板），run_queue 是执行（临时）。

export interface QueueDef {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface QueueItemDef {
    id: number;
    queueId: number;
    taskId: number;
    modelId: string;
    position: number;
    createdAt: string;
}

export interface QueueDefWithItems extends QueueDef {
    items: QueueItemDef[];
}

function now() {
    return new Date().toISOString();
}

export function listQueues(db: Database): QueueDef[] {
    const rows = db
        .prepare('SELECT * FROM queues ORDER BY updated_at DESC, id DESC')
        .all() as (QueueDef & Record<string, string>)[];
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}

export function createQueue(db: Database, input: { name: string }): QueueDef {
    const time = now();
    const result = db
        .prepare('INSERT INTO queues (name, created_at, updated_at) VALUES (?, ?, ?)')
        .run(input.name, time, time);
    const row = db
        .prepare('SELECT * FROM queues WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Record<string, string>;
    return {
        id: Number(row.id),
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function getQueue(db: Database, id: number): QueueDefWithItems | null {
    const qRow = db.prepare('SELECT * FROM queues WHERE id = ?').get(id) as Record<
        string,
        string
    > | null;
    if (!qRow) {
        return null;
    }
    const itemRows = db
        .prepare('SELECT * FROM queue_items WHERE queue_id = ? ORDER BY position')
        .all(id) as Record<string, string>[];
    return {
        id: Number(qRow.id),
        name: qRow.name,
        createdAt: qRow.created_at,
        updatedAt: qRow.updated_at,
        items: itemRows.map((row) => ({
            id: Number(row.id),
            queueId: Number(row.queue_id),
            taskId: Number(row.task_id),
            modelId: row.model_id,
            position: Number(row.position),
            createdAt: row.created_at,
        })),
    };
}

// 全量替换：先删旧条目再插入新条目，保证顺序正确
export function updateQueue(
    db: Database,
    id: number,
    input: { name: string; items: { taskId: number; modelId: string }[] },
) {
    const time = now();
    db.prepare('UPDATE queues SET name = ?, updated_at = ? WHERE id = ?').run(input.name, time, id);
    db.prepare('DELETE FROM queue_items WHERE queue_id = ?').run(id);
    input.items.forEach((item, index) => {
        db.prepare(
            'INSERT INTO queue_items (queue_id, task_id, model_id, position, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(id, item.taskId, item.modelId, index + 1, time);
    });
}

export function deleteQueue(db: Database, id: number) {
    db.prepare('DELETE FROM queue_items WHERE queue_id = ?').run(id);
    db.prepare('DELETE FROM queues WHERE id = ?').run(id);
}
