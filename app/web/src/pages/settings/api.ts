import type { SystemInfo } from '@lookrun/shared';
import { request } from '../../api/request';
import type { ModelBrief, StorageStats } from '../../api/types';

export type { ModelBrief, StorageStats };

export const api = {
    listModels: () => request<{ models: ModelBrief[]; selected: string | null }>('/api/models'),
    selectModel: (id: string) =>
        request<{ ok: boolean }>('/api/models/select', {
            method: 'PUT',
            body: JSON.stringify({ id }),
        }),
    checkModel: (id: string) =>
        request<{ ok: boolean; message: string }>(`/api/models/${id}/check`, {
            method: 'POST',
        }),
    getVariables: () => request<Record<string, string>>('/api/variables'),
    saveVariables: (variables: Record<string, string>) =>
        request<{ ok: boolean }>('/api/variables', {
            method: 'PUT',
            body: JSON.stringify({ variables }),
        }),
    systemInfo: () => request<SystemInfo>('/api/system'),
    storageStats: () => request<StorageStats>('/api/system/storage'),
    cleanupStorage: () =>
        request<{ deletedRuns: number; freedBytes: number }>('/api/system/storage/cleanup', {
            method: 'POST',
        }),
};

export type ModelSettings = {
    baseUrl: string;
    hasApiKey: boolean;
    models: { id: string; name: string; model: string; family: string }[];
};
export const modelSettingsApi = {
    read: () => request<ModelSettings>('/api/models/config'),
    save: (config: Omit<ModelSettings, 'hasApiKey'> & { apiKey: string }) =>
        request<ModelSettings>('/api/models/config', {
            method: 'PUT',
            body: JSON.stringify(config),
        }),
};
