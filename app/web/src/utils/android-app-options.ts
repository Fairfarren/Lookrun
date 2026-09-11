import type { AndroidAppRecord } from '@lookrun/shared';

export function createAndroidAppOptions(apps: AndroidAppRecord[]) {
    return apps.map(({ packageName }) => ({
        label: packageName,
        value: packageName,
    }));
}
