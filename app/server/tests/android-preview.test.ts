import { describe, expect, test } from 'bun:test';
import {
    ANDROID_PREVIEW_INTERVAL_MS,
    createLatestFramePump,
    isDuplicatePreviewFrame,
    previewPublishData,
    previewTickBlocked,
    shouldReportPreviewError,
} from '../src/services/android-preview';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createFrame(capturedAt: number) {
    return { ref: { capturedAt }, capturedAt };
}

describe('Android 实时预览', () => {
    test('目标刷新间隔为 100 毫秒', () => {
        expect(ANDROID_PREVIEW_INTERVAL_MS).toBe(100);
    });

    test('tick 前置条件', () => {
        expect(previewTickBlocked({ stopped: true, inFlight: false, hasViewer: true })).toBe(true);
        expect(previewTickBlocked({ stopped: false, inFlight: true, hasViewer: true })).toBe(true);
        expect(previewTickBlocked({ stopped: false, inFlight: false, hasViewer: false })).toBe(
            true,
        );
        expect(previewTickBlocked({ stopped: false, inFlight: false, hasViewer: true })).toBe(
            false,
        );
        expect(isDuplicatePreviewFrame(null, 1)).toBe(true);
        expect(isDuplicatePreviewFrame({ capturedAt: 1 }, 1)).toBe(true);
        expect(isDuplicatePreviewFrame({ capturedAt: 2 }, 1)).toBe(false);
        expect(previewPublishData(undefined, false)).toBeNull();
        expect(previewPublishData('data:image/jpeg;base64,abc', false)).toBe('abc');
        expect(shouldReportPreviewError(true, false)).toBe(false);
        expect(shouldReportPreviewError(false, true)).toBe(false);
        expect(shouldReportPreviewError(false, false)).toBe(true);
    });

    test('相同帧只解码并发布一次', async () => {
        const frame = createFrame(1);
        let decodeCount = 0;
        const published: string[] = [];
        const pump = createLatestFramePump({
            source: {
                latest: () => frame,
                decode: async () => {
                    decodeCount += 1;
                    return ['data:image/jpeg;base64,frame-one'];
                },
                stop: () => {},
            },
            hasViewer: () => true,
            publish: (data) => published.push(data),
            onError: () => {},
        });

        await pump.tick();
        await pump.tick();

        expect({ decodeCount, published }).toEqual({
            decodeCount: 1,
            published: ['frame-one'],
        });
    });

    test('上一帧仍在解码时跳过新 tick', async () => {
        const frame = createFrame(1);
        const decodeResult = deferred<string[]>();
        let decodeCount = 0;
        const pump = createLatestFramePump({
            source: {
                latest: () => frame,
                decode: () => {
                    decodeCount += 1;
                    return decodeResult.promise;
                },
                stop: () => {},
            },
            hasViewer: () => true,
            publish: () => {},
            onError: () => {},
        });

        const firstTick = pump.tick();
        void pump.tick();
        decodeResult.resolve(['frame-one']);
        await firstTick;

        expect(decodeCount).toBe(1);
    });

    test('没有网页观看者时不解码', async () => {
        let decodeCount = 0;
        const pump = createLatestFramePump({
            source: {
                latest: () => createFrame(1),
                decode: async () => {
                    decodeCount += 1;
                    return ['frame-one'];
                },
                stop: () => {},
            },
            hasViewer: () => false,
            publish: () => {},
            onError: () => {},
        });

        await pump.tick();

        expect(decodeCount).toBe(0);
    });

    test('瞬时解码失败后重试同一最新帧', async () => {
        const frame = createFrame(1);
        let decodeCount = 0;
        const published: string[] = [];
        const pump = createLatestFramePump({
            source: {
                latest: () => frame,
                decode: async () => {
                    decodeCount += 1;
                    if (decodeCount === 1) {
                        throw new Error('临时解码失败');
                    }
                    return ['frame-one'];
                },
                stop: () => {},
            },
            hasViewer: () => true,
            publish: (data) => published.push(data),
            onError: () => {},
        });

        await pump.tick();
        await pump.tick();

        expect({ decodeCount, published }).toEqual({
            decodeCount: 2,
            published: ['frame-one'],
        });
    });

    test('停止时等待在途解码并阻止迟到帧发布', async () => {
        const decodeResult = deferred<string[]>();
        const published: string[] = [];
        let sourceStopped = false;
        const pump = createLatestFramePump({
            source: {
                latest: () => createFrame(1),
                decode: () => decodeResult.promise,
                stop: () => {
                    sourceStopped = true;
                },
            },
            hasViewer: () => true,
            publish: (data) => published.push(data),
            onError: () => {},
        });

        void pump.tick();
        const stopping = pump.stop();
        decodeResult.resolve(['frame-one']);
        await stopping;

        expect({ published, sourceStopped }).toEqual({
            published: [],
            sourceStopped: true,
        });
    });
});
