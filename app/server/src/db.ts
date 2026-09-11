import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { RunRecord, RunStatus, RunStepRecord, TaskRecord } from '@lookrun/shared';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  yaml TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  task_name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS run_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  step_name TEXT,
  action TEXT NOT NULL,
  url TEXT,
  prompt TEXT,
  ai_result TEXT,
  shot_before TEXT,
  shot_after TEXT,
  duration_ms INTEGER,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL,
  run_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS queue_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
`;

export function createDb(dbPath: string) {
    if (dbPath !== ':memory:') {
        mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);
    return db;
}

function now() {
    return new Date().toISOString();
}

// ---------- 任务 ----------

interface TaskRow {
    id: number;
    name: string;
    yaml: string;
    created_at: string;
    updated_at: string;
}

function toTask(row: TaskRow): TaskRecord {
    return {
        id: row.id,
        name: row.name,
        yaml: row.yaml,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function insertTask(db: Database, input: { name: string; yaml: string }) {
    const time = now();
    const result = db
        .prepare('INSERT INTO tasks (name, yaml, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(input.name, input.yaml, time, time);
    return { id: Number(result.lastInsertRowid) };
}

export function updateTask(db: Database, id: number, input: { name: string; yaml: string }) {
    db.prepare('UPDATE tasks SET name = ?, yaml = ?, updated_at = ? WHERE id = ?').run(
        input.name,
        input.yaml,
        now(),
        id,
    );
}

export function deleteTask(db: Database, id: number) {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function getTask(db: Database, id: number) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | null;
    return row ? toTask(row) : null;
}

export function listTasks(db: Database) {
    const rows = db
        .prepare('SELECT * FROM tasks ORDER BY updated_at DESC, id DESC')
        .all() as TaskRow[];
    return rows.map(toTask);
}

// ---------- 运行 ----------

interface RunRow {
    id: number;
    task_id: number | null;
    task_name: string;
    model: string;
    status: string;
    error: string | null;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
    token_input: number;
    token_output: number;
}

function toRun(row: RunRow): RunRecord {
    return {
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        model: row.model,
        status: row.status as RunStatus,
        error: row.error,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        tokenInput: row.token_input,
        tokenOutput: row.token_output,
    };
}

export function insertRun(
    db: Database,
    input: { taskId: number | null; taskName: string; model: string },
) {
    const result = db
        .prepare(
            "INSERT INTO runs (task_id, task_name, model, status, started_at) VALUES (?, ?, ?, 'running', ?)",
        )
        .run(input.taskId, input.taskName, input.model, now());
    const id = Number(result.lastInsertRowid);
    return { id, status: 'running' as const };
}

export function finishRun(
    db: Database,
    id: number,
    input: {
        status: RunStatus;
        error: string | null;
        durationMs: number;
        tokenInput: number;
        tokenOutput: number;
    },
) {
    db.prepare(
        'UPDATE runs SET status = ?, error = ?, finished_at = ?, duration_ms = ?, token_input = ?, token_output = ? WHERE id = ?',
    ).run(
        input.status,
        input.error,
        now(),
        input.durationMs,
        input.tokenInput,
        input.tokenOutput,
        id,
    );
}

export function getRun(db: Database, id: number) {
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | null;
    return row ? toRun(row) : null;
}

export function listRuns(db: Database, page: { limit: number; offset: number }) {
    const rows = db
        .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(page.limit, page.offset) as RunRow[];
    return rows.map(toRun);
}

export function countRuns(db: Database) {
    const row = db.prepare('SELECT COUNT(*) AS count FROM runs').get() as {
        count: number;
    };
    return row.count;
}

// 程序重启后，上次遗留的 running 运行标记为 stopped
export function markStaleRunsStopped(db: Database) {
    db.prepare(
        "UPDATE runs SET status = 'stopped', error = '程序重启，运行中断', finished_at = ? WHERE status = 'running'",
    ).run(now());
}

// ---------- 运行步骤 ----------

interface StepRow {
    id: number;
    run_id: number;
    step_index: number;
    step_name: string | null;
    action: string;
    url: string | null;
    prompt: string | null;
    ai_result: string | null;
    shot_before: string | null;
    shot_after: string | null;
    duration_ms: number | null;
    token_input: number;
    token_output: number;
    status: string;
    error: string | null;
    created_at: string;
}

function toStep(row: StepRow): RunStepRecord {
    return {
        id: row.id,
        runId: row.run_id,
        stepIndex: row.step_index,
        stepName: row.step_name,
        action: row.action,
        url: row.url,
        prompt: row.prompt,
        aiResult: row.ai_result,
        shotBefore: row.shot_before,
        shotAfter: row.shot_after,
        durationMs: row.duration_ms,
        tokenInput: row.token_input,
        tokenOutput: row.token_output,
        status: row.status as RunStepRecord['status'],
        error: row.error,
        createdAt: row.created_at,
    };
}

export function insertStep(
    db: Database,
    input: {
        runId: number;
        stepIndex: number;
        stepName: string | null;
        action: string;
        url: string | null;
        prompt: string | null;
        aiResult: string | null;
        shotBefore: string | null;
        shotAfter: string | null;
        durationMs: number;
        tokenInput: number;
        tokenOutput: number;
        status: RunStepRecord['status'];
        error: string | null;
    },
) {
    const result = db
        .prepare(
            `INSERT INTO run_steps
       (run_id, step_index, step_name, action, url, prompt, ai_result, shot_before, shot_after, duration_ms, token_input, token_output, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            input.runId,
            input.stepIndex,
            input.stepName,
            input.action,
            input.url,
            input.prompt,
            input.aiResult,
            input.shotBefore,
            input.shotAfter,
            input.durationMs,
            input.tokenInput,
            input.tokenOutput,
            input.status,
            input.error,
            now(),
        );
    return { id: Number(result.lastInsertRowid) };
}

export function listRunSteps(db: Database, runId: number) {
    const rows = db
        .prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index ASC')
        .all(runId) as StepRow[];
    return rows.map(toStep);
}

// ---------- 变量与设置（kv 表，var: 前缀存变量，setting: 前缀存设置） ----------

const VARIABLE_PREFIX = 'var:';

export function setVariable(db: Database, name: string, value: string) {
    const key = `${VARIABLE_PREFIX}${name}`;
    db.prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value);
}

export function listVariables(db: Database) {
    const rows = db
        .prepare('SELECT key, value FROM kv WHERE key LIKE ? ORDER BY key')
        .all(`${VARIABLE_PREFIX}%`) as {
        key: string;
        value: string;
    }[];
    return Object.fromEntries(
        rows.map((row) => [row.key.slice(VARIABLE_PREFIX.length), row.value]),
    );
}

export function replaceVariables(db: Database, variables: Record<string, string>) {
    const keyPattern = `${VARIABLE_PREFIX}%`;
    db.prepare('DELETE FROM kv WHERE key LIKE ?').run(keyPattern);
    for (const [name, value] of Object.entries(variables)) {
        setVariable(db, name, value);
    }
}

export function getSetting(db: Database, key: string) {
    const settingKey = `setting:${key}`;
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(settingKey) as {
        value: string;
    } | null;
    return row?.value ?? null;
}

export function setSetting(db: Database, key: string, value: string) {
    const settingKey = `setting:${key}`;
    db.prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(settingKey, value);
}
