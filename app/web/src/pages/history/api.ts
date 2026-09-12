import type { RunRecord } from '@lookrun/shared';
import { request } from '../../api/request';

export const api = {
    listRuns: (page: { limit: number; offset: number }) =>
        request<{ list: RunRecord[]; total: number }>(
            `/api/runs?limit=${page.limit}&offset=${page.offset}`,
        ),
};
