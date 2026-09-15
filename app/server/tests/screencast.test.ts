import { describe, expect, test } from 'bun:test';
import { handleScreencastFrame, shouldSendScreencastFrame } from '@server/services/screencast';

describe('screencast 帧间隔', () => {
    test('间隔不够不发送', () => {
        expect(shouldSendScreencastFrame({ now: 50, lastFrameAt: 0, minInterval: 100 })).toBe(
            false,
        );
        expect(shouldSendScreencastFrame({ now: 100, lastFrameAt: 0, minInterval: 100 })).toBe(
            true,
        );
    });

    test('到达间隔才发布', () => {
        const published: string[] = [];
        const sent: number[] = [];
        expect(
            handleScreencastFrame({
                now: 10,
                lastFrameAt: 0,
                minInterval: 100,
                data: 'a',
                publish: (data) => published.push(data),
                markSent: (at) => sent.push(at),
            }),
        ).toBe(false);
        expect(
            handleScreencastFrame({
                now: 100,
                lastFrameAt: 0,
                minInterval: 100,
                data: 'b',
                publish: (data) => published.push(data),
                markSent: (at) => sent.push(at),
            }),
        ).toBe(true);
        expect(published).toEqual(['b']);
        expect(sent).toEqual([100]);
    });
});
