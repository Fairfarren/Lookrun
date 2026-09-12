import type { AndroidAppRecord, AndroidDeviceRecord, TaskRecord } from '@lookrun/shared';
import { request } from '../../api/request';

export const api = {
    getTask: (id: number) => request<TaskRecord>(`/api/tasks/${id}`),
    createTask: (input: { name: string; yaml: string }) =>
        request<TaskRecord>('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updateTask: (id: number, input: { name: string; yaml: string }) =>
        request<TaskRecord>(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    validateYaml: (yaml: string) =>
        request<{ ok: boolean; errors: string[] }>('/api/tasks/validate', {
            method: 'POST',
            body: JSON.stringify({ yaml }),
        }),
    listAndroidDevices: () =>
        request<{ devices: AndroidDeviceRecord[] }>('/api/system/android-devices'),
    listAndroidApps: (deviceId: string) =>
        request<{ apps: AndroidAppRecord[] }>(
            `/api/system/android-apps?deviceId=${encodeURIComponent(deviceId)}`,
        ),
    checkAndroidDevice: (deviceId: string) =>
        request<{ ok: true; device: AndroidDeviceRecord } | { ok: false; message: string }>(
            '/api/system/android-devices/check',
            {
                method: 'POST',
                body: JSON.stringify({ deviceId }),
            },
        ),
};
