import type { Database } from "bun:sqlite";

// 运行队列：单任务串行执行，忙时新任务进入队列排队，前一个跑完自动接下一个
// 表结构在 db.ts 的 SCHEMA 里统一创建

export type QueueStatus = "pending" | "running" | "done" | "cancelled";

export interface QueueItem {
	id: number;
	taskId: number;
	taskName: string;
	modelId: string;
	model: string;
	status: QueueStatus;
	position: number;
	runId: number | null;
	createdAt: string;
}

interface QueueRow {
	id: number;
	task_id: number;
	task_name: string;
	model_id: string;
	model: string;
	status: string;
	position: number;
	run_id: number | null;
	created_at: string;
}

function toQueueItem(row: QueueRow): QueueItem {
	return {
		id: row.id,
		taskId: row.task_id,
		taskName: row.task_name,
		modelId: row.model_id,
		model: row.model,
		status: row.status as QueueStatus,
		position: row.position,
		runId: row.run_id,
		createdAt: row.created_at,
	};
}

// 入队：position 取当前最大值 +1，保证先进先出
export function enqueue(
	db: Database,
	input: { taskId: number; taskName: string; modelId: string; model: string },
) {
	const max = db
		.prepare("SELECT COALESCE(MAX(position), 0) AS max FROM run_queue")
		.get() as { max: number };
	const position = max.max + 1;
	const result = db
		.prepare(
			"INSERT INTO run_queue (task_id, task_name, model_id, model, status, position, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
		)
		.run(
			input.taskId,
			input.taskName,
			input.modelId,
			input.model,
			position,
			new Date().toISOString(),
		);
	const row = db
		.prepare("SELECT * FROM run_queue WHERE id = ?")
		.get(Number(result.lastInsertRowid)) as QueueRow;
	return toQueueItem(row);
}

// 队列列表：只含待执行和执行中，按 position 排序
export function listQueue(db: Database) {
	const rows = db
		.prepare(
			"SELECT * FROM run_queue WHERE status IN ('pending', 'running') ORDER BY position",
		)
		.all() as QueueRow[];
	return rows.map(toQueueItem);
}

export function nextPending(db: Database) {
	const row = db
		.prepare(
			"SELECT * FROM run_queue WHERE status = 'pending' ORDER BY position LIMIT 1",
		)
		.get() as QueueRow | null;
	return row ? toQueueItem(row) : null;
}

export function setQueueStatus(
	db: Database,
	id: number,
	status: QueueStatus,
	runId?: number,
) {
	db.prepare(
		"UPDATE run_queue SET status = ?, run_id = COALESCE(?, run_id) WHERE id = ?",
	).run(status, runId ?? null, id);
}

// 上移/下移：与相邻的 pending 条目交换 position（running 条目位置固定）
export function moveQueueItem(
	db: Database,
	id: number,
	direction: "up" | "down",
) {
	const current = db
		.prepare("SELECT * FROM run_queue WHERE id = ?")
		.get(id) as QueueRow | null;
	if (!current || current.status !== "pending") {
		return;
	}
	const neighborQuery =
		direction === "up"
			? "SELECT * FROM run_queue WHERE status = 'pending' AND position < ? ORDER BY position DESC LIMIT 1"
			: "SELECT * FROM run_queue WHERE status = 'pending' AND position > ? ORDER BY position LIMIT 1";
	const neighbor = db
		.prepare(neighborQuery)
		.get(current.position) as QueueRow | null;
	if (!neighbor) {
		return;
	}
	db.prepare("UPDATE run_queue SET position = ? WHERE id = ?").run(
		neighbor.position,
		current.id,
	);
	db.prepare("UPDATE run_queue SET position = ? WHERE id = ?").run(
		current.position,
		neighbor.id,
	);
}

export function cancelQueueItem(db: Database, id: number) {
	db.prepare(
		"UPDATE run_queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
	).run(id);
}

// 程序重启时，上次中断的 running 条目恢复为 pending 等待重新调度
export function requeueInterrupted(db: Database) {
	db.prepare(
		"UPDATE run_queue SET status = 'pending' WHERE status = 'running'",
	).run();
}
