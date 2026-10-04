import { describe, expect, test } from 'bun:test';
import { applyDroppedSort, dragOverId, reorderById } from '../src/utils/sortable-items';

const items = [
    { id: 'a', taskId: 1 },
    { id: 'b', taskId: 2 },
    { id: 'c', taskId: 3 },
];

test('没有放置目标时用拖拽项自身作为落点', () => {
    expect(dragOverId(null, { id: 'a' })).toBe('a');
});

test('有放置目标时使用目标编号', () => {
    expect(dragOverId({ id: 'b' }, { id: 'a' })).toBe('b');
});

test('没有放置目标时保持原顺序', () => {
    expect(applyDroppedSort(items, { over: null, active: { id: 'a' } })).toBe(items);
});

test('有放置目标时按编号重排', () => {
    expect(
        applyDroppedSort(items, { over: { id: 'c' }, active: { id: 'a' } }).map((item) => item.id),
    ).toEqual(['b', 'c', 'a']);
});

describe('任务拖拽排序', () => {
    test('将后面的任务拖到前面', () => {
        const result = reorderById(items, 'c', 'a');

        expect(result.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    });

    test('将前面的任务拖到后面', () => {
        const result = reorderById(items, 'a', 'c');

        expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    });

    test('拖拽目标不存在时保持原顺序', () => {
        const result = reorderById(items, 'a', 'missing');

        expect(result).toBe(items);
    });
});
