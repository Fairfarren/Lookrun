import type { DeviceFrameSource } from '@midscene/core/device';

export const ANDROID_PREVIEW_INTERVAL_MS = 100;

interface LatestFramePumpInput {
    source: DeviceFrameSource;
    hasViewer: () => boolean;
    publish: (data: string) => void;
    onError: (error: unknown) => void;
}

export function createLatestFramePump(input: LatestFramePumpInput) {
    let stopped = false;
    let inFlight: Promise<void> | null = null;
    let lastCapturedAt: number | null = null;
    let errorReported = false;

    const tick = () => {
        if (stopped || inFlight || !input.hasViewer()) {
            return inFlight ?? Promise.resolve();
        }
        const frame = input.source.latest();
        if (!frame || frame.capturedAt === lastCapturedAt) {
            return Promise.resolve();
        }
        const work = input.source
            .decode([frame])
            .then(([data]) => {
                lastCapturedAt = frame.capturedAt;
                errorReported = false;
                if (!stopped && data) {
                    input.publish(data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''));
                }
            })
            .catch((error) => {
                if (!stopped && !errorReported) {
                    errorReported = true;
                    input.onError(error);
                }
            })
            .finally(() => {
                if (inFlight === work) {
                    inFlight = null;
                }
            });
        inFlight = work;
        return work;
    };

    const stop = async () => {
        stopped = true;
        await inFlight;
        await input.source.stop();
    };

    return { tick, stop };
}

export function startAndroidLivePreview(input: LatestFramePumpInput) {
    const pump = createLatestFramePump(input);
    const timer = setInterval(() => {
        void pump.tick();
    }, ANDROID_PREVIEW_INTERVAL_MS);
    void pump.tick();

    return async () => {
        clearInterval(timer);
        await pump.stop();
    };
}
