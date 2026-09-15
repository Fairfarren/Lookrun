import { describe, expect, test } from 'bun:test';
import { reorderById } from '@/utils/sortable-items';

const items = [
    { id: 'a', taskId: 1 },
    { id: 'b', taskId: 2 },
    { id: 'c', taskId: 3 },
];

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
