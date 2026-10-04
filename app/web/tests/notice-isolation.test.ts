import './helpers/dom';
import { expect, test } from 'bun:test';
import { toast } from 'sonner';
import { latestNotice, useDomTests } from './helpers/render';

useDomTests();

test('清理上一轮同名通知后不会把旧历史当作本轮通知', () => {
    toast.error('操作被拒绝');
    toast.dismiss();

    const notice = latestNotice();

    expect(notice).toBeUndefined();
});

test('清理后重新发出同名通知能读取本轮新通知', () => {
    toast.error('操作被拒绝');
    toast.dismiss();

    const id = toast.error('操作被拒绝');

    expect(latestNotice()).toMatchObject({ id, title: '操作被拒绝' });
});
