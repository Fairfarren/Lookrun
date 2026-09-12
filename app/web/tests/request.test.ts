import { expect, test } from 'bun:test';
import { jsonRequestHeaders, requestErrorText } from '../src/api/request';

test('有请求体时带 JSON Content-Type', () => {
    expect(jsonRequestHeaders(true)).toEqual({ 'Content-Type': 'application/json' });
});

test('无请求体时不带 Content-Type', () => {
    expect(jsonRequestHeaders(false)).toBeUndefined();
});

test('优先用 errors 列表拼错误', () => {
    expect(requestErrorText({ errors: ['a', 'b'] }, 400)).toBe('a；b');
});

test('其次用 error 字段', () => {
    expect(requestErrorText({ error: '失败' }, 400)).toBe('失败');
});

test('都没有时用状态码', () => {
    expect(requestErrorText({}, 502)).toBe('请求失败（502）');
});
