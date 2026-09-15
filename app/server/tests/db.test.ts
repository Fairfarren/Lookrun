import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    countRuns,
    createDb,
    deleteTask,
    finishRun,
    getRun,
    getTask,
    insertRun,
    insertStep,
    insertTask,
    listRuns,
    listRunSteps,
    listTasks,
    listVariables,
    setVariable,
    updateTask,
} from '@server/db';

let db: Database;
let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'twai-test-'));
    db = createDb(path.join(tempDir, 'test.db'));
});

afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
});

describe('任务 CRUD', () => {
    test('新增后能按 id 读取，列表按更新时间倒序', () => {
        const a = insertTask(db, { name: '任务A', yaml: 'target: https://a.com' });
        const b = insertTask(db, { name: '任务B', yaml: 'target: https://b.com' });

        expect(getTask(db, a.id)?.name).toBe('任务A');
        const list = listTasks(db);
        expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
    });

    test('更新任务名和 YAML', () => {
        const { id } = insertTask(db, { name: '旧名', yaml: 'old' });
        updateTask(db, id, { name: '新名', yaml: 'new' });

        const task = getTask(db, id);
        expect(task?.name).toBe('新名');
        expect(task?.yaml).toBe('new');
    });

    test('删除任务', () => {
        const { id } = insertTask(db, { name: 'x', yaml: 'y' });
        deleteTask(db, id);
        expect(getTask(db, id)).toBeNull();
    });
});

describe('运行与步骤', () => {
    test('创建运行、写入步骤、结束运行', () => {
        const run = insertRun(db, { taskId: 1, taskName: '登录测试', model: 'gemma4:cloud' });
        expect(run.status).toBe('running');

        insertStep(db, {
            runId: run.id,
            stepIndex: 0,
            stepName: '登录',
            action: 'aiTap',
            url: 'https://a.com/login',
            prompt: '点击登录按钮',
            aiResult: '{"bbox":[10,20,30,40]}',
            shotBefore: 'shots/1/0-before.jpg',
            shotAfter: 'shots/1/0-after.jpg',
            durationMs: 1200,
            tokenInput: 100,
            tokenOutput: 20,
            status: 'success',
            error: null,
        });

        finishRun(db, run.id, {
            status: 'success',
            error: null,
            durationMs: 5000,
            tokenInput: 100,
            tokenOutput: 20,
        });

        const detail = getRun(db, run.id);
        expect(detail?.status).toBe('success');
        expect(detail?.tokenInput).toBe(100);
        expect(detail?.finishedAt).not.toBeNull();

        const steps = listRunSteps(db, run.id);
        expect(steps).toHaveLength(1);
        expect(steps[0].action).toBe('aiTap');
        expect(steps[0].tokenOutput).toBe(20);
    });

    test('运行列表分页与总数', () => {
        for (let i = 0; i < 5; i++) {
            insertRun(db, { taskId: null, taskName: `任务${i}`, model: 'm' });
        }
        expect(countRuns(db)).toBe(5);
        const page = listRuns(db, { limit: 2, offset: 0 });
        expect(page).toHaveLength(2);
        expect(listRuns(db, { limit: 2, offset: 4 })).toHaveLength(1);
    });
});

describe('变量', () => {
    test('写入并读取全部变量', () => {
        setVariable(db, 'USERNAME', 'alice');
        setVariable(db, 'PASSWORD', 's3cret');
        expect(listVariables(db)).toEqual({ PASSWORD: 's3cret', USERNAME: 'alice' });
    });

    test('重复写入覆盖', () => {
        setVariable(db, 'A', '1');
        setVariable(db, 'A', '2');
        expect(listVariables(db)).toEqual({ A: '2' });
    });
});
