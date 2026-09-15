import { describe, expect, test } from 'bun:test';
import { createAndroidAppOptions } from '@/pages/task-edit/android-app-options';

describe('createAndroidAppOptions', () => {
    test('把每个可启动包名转换成可选择项', () => {
        expect(
            createAndroidAppOptions([
                { packageName: 'com.example.alpha' },
                { packageName: 'com.example.beta' },
            ]),
        ).toEqual([
            { label: 'com.example.alpha', value: 'com.example.alpha' },
            { label: 'com.example.beta', value: 'com.example.beta' },
        ]);
    });
});
