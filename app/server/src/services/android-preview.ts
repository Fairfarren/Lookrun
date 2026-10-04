import type { DeviceFrameSource } from '@midscene/core/device';

export const ANDROID_PREVIEW_INTERVAL_MS = 100;

type PreviewFrame = NonNullable<ReturnType<DeviceFrameSource['latest']>>;

interface LatestFramePumpInput {
    source: DeviceFrameSource;
    hasViewer: () => boolean;
    publish: (data: string) => void;
    onError: (error: unknown) => void;
}

export function previewTickUnavailable(input: { inFlight: boolean; hasViewer: boolean }) {
    if (input.inFlight) {
        return true;
    }
    return !input.hasViewer;
}

export function previewTickBlocked(input: {
    stopped: boolean;
    inFlight: boolean;
    hasViewer: boolean;
}) {
    if (input.stopped) {
        return true;
    }
    return previewTickUnavailable(input);
}

export function inFlightOrResolved(inFlight: Promise<void> | null) {
    if (inFlight) {
        return inFlight;
    }
    return Promise.resolve();
}

export function isDuplicatePreviewFrame(
    frame: { capturedAt: number } | null,
    lastCapturedAt: number | null,
) {
    if (!frame) {
        return true;
    }
    return frame.capturedAt === lastCapturedAt;
}

export function stripPreviewPayload(data: string | undefined) {
    if (!data) {
        return null;
    }
    return data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

export function previewPublishData(data: string | undefined, stopped: boolean) {
    if (stopped) {
        return null;
    }
    return stripPreviewPayload(data);
}

export function shouldReportPreviewError(stopped: boolean, errorReported: boolean) {
    if (stopped) {
        return false;
    }
    return !errorReported;
}

type PreviewPumpState = {
    stopped: boolean;
    inFlight: Promise<void> | null;
    lastCapturedAt: number | null;
    errorReported: boolean;
};

export function applyPreviewDecoded(input: {
    state: PreviewPumpState;
    capturedAt: number;
    data: string | undefined;
    publish: (data: string) => void;
}) {
    input.state.lastCapturedAt = input.capturedAt;
    input.state.errorReported = false;
    const payload = previewPublishData(input.data, input.state.stopped);
    if (payload) {
        input.publish(payload);
    }
}

export function applyPreviewDecodeError(input: {
    state: PreviewPumpState;
    error: unknown;
    onError: (error: unknown) => void;
}) {
    if (!shouldReportPreviewError(input.state.stopped, input.state.errorReported)) {
        return;
    }
    input.state.errorReported = true;
    input.onError(input.error);
}

export function clearPreviewInFlight(state: PreviewPumpState, work: Promise<void>) {
    if (state.inFlight !== work) {
        return;
    }
    state.inFlight = null;
}

export function decodePreviewFrame(input: LatestFramePumpInput, state: PreviewPumpState) {
    const frame = input.source.latest();
    if (!frame) {
        return Promise.resolve();
    }
    return decodeCapturedPreviewFrame(input, state, frame);
}

function decodeCapturedPreviewFrame(
    input: LatestFramePumpInput,
    state: PreviewPumpState,
    frame: PreviewFrame,
) {
    if (isDuplicatePreviewFrame(frame, state.lastCapturedAt)) {
        return Promise.resolve();
    }
    const work = input.source
        .decode([frame])
        .then(([data]) => {
            applyPreviewDecoded({
                state,
                capturedAt: frame.capturedAt,
                data,
                publish: input.publish,
            });
        })
        .catch((error) => {
            applyPreviewDecodeError({ state, error, onError: input.onError });
        })
        .finally(() => {
            clearPreviewInFlight(state, work);
        });
    state.inFlight = work;
    return work;
}

export function runPreviewTick(input: LatestFramePumpInput, state: PreviewPumpState) {
    if (
        previewTickBlocked({
            stopped: state.stopped,
            inFlight: Boolean(state.inFlight),
            hasViewer: input.hasViewer(),
        })
    ) {
        return inFlightOrResolved(state.inFlight);
    }
    return decodePreviewFrame(input, state);
}

export function createLatestFramePump(input: LatestFramePumpInput) {
    const state: PreviewPumpState = {
        stopped: false,
        inFlight: null,
        lastCapturedAt: null,
        errorReported: false,
    };

    return {
        tick: () => runPreviewTick(input, state),
        stop: async () => {
            state.stopped = true;
            await state.inFlight;
            await input.source.stop();
        },
    };
}

export function startAndroidLivePreview(
    input: LatestFramePumpInput,
    timers?: Pick<typeof globalThis, 'setInterval' | 'clearInterval'>,
) {
    const clock = timers ?? { setInterval, clearInterval };
    const pump = createLatestFramePump(input);
    const timer = clock.setInterval(() => {
        void pump.tick();
    }, ANDROID_PREVIEW_INTERVAL_MS);
    void pump.tick();

    return async () => {
        clock.clearInterval(timer);
        await pump.stop();
    };
}
