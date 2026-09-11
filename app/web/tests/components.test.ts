import { describe, expect, test } from 'bun:test';
import { formatDuration, formatTime } from '../src/components';

describe('formatDuration', () => {
    test('空值显示横杠', () => {
        expect(formatDuration(null)).toBe('-');
    });

    test('不足一秒显示毫秒', () => {
        expect(formatDuration(20)).toBe('20ms');
    });

    test('不少于一秒显示秒', () => {
        expect(formatDuration(1500)).toBe('1.5s');
    });
});

describe('formatTime', () => {
    test('空值显示横杠', () => {
        expect(formatTime(null)).toBe('-');
    });
});
