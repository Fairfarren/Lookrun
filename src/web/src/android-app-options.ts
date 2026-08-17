import type { AndroidAppRecord } from "../../shared/types";

export function createAndroidAppOptions(apps: AndroidAppRecord[]) {
	return apps.map(({ packageName }) => ({
		label: packageName,
		value: packageName,
	}));
}
