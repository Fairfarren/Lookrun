import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { request } from '../../api/request';

export const api = {
    runDetail: (id: number) =>
        request<{ run: RunRecord; steps: RunStepRecord[] }>(`/api/runs/${id}`),
};

export function screenshotUrl(relativePath: string) {
    return `/api/screenshots/${relativePath}`;
}
