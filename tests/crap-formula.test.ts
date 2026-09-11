import { describe, expect, test } from 'bun:test';
import { calculateCrap, CRAP_THRESHOLD, passesCrap } from '../scripts/crap/formula';

describe('calculateCrap', () => {
    test('测满时 CRAP 等于 CC', () => {
        expect(calculateCrap(8, 1)).toBe(8);
    });

    test('无覆盖时 CRAP 等于 CC 平方加 CC', () => {
        expect(calculateCrap(3, 0)).toBe(12);
    });

    test('覆盖率超出 0-1 时按边界计算', () => {
        expect(calculateCrap(4, 2)).toBe(4);
        expect(calculateCrap(2, -1)).toBe(6);
    });
});

describe('passesCrap', () => {
    test('测满 CC 为门槛时通过', () => {
        expect(passesCrap(CRAP_THRESHOLD, 1)).toBe(true);
    });

    test('测满 CC 超过门槛时不通过', () => {
        expect(passesCrap(CRAP_THRESHOLD + 1, 1)).toBe(false);
    });

    test('无覆盖 CC 为 2 时通过', () => {
        expect(passesCrap(2, 0)).toBe(true);
    });

    test('无覆盖 CC 为 3 时不通过', () => {
        expect(passesCrap(3, 0)).toBe(false);
    });
});
