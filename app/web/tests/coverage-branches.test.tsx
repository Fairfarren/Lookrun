import './helpers/dom';
import { expect, test } from 'bun:test';
import { RunStatusTag } from '../src/components';
import { ConfirmHost, dismissIfClosed } from '../src/components/confirm-host';
import { confirmAction } from '../src/components/confirm';
import { commitSelectValue, SelectField } from '../src/components/select-field';
import { Badge } from '../src/components/ui/badge';
import { button, click, flush, render, useDomTests } from './helpers/render';

useDomTests();

test('占位选项不会提交选择值', () => {
    const values: string[] = [];

    commitSelectValue('__empty__', (value) => values.push(value));

    expect(values).toEqual([]);
});

test('有效选项提交选择值', () => {
    const values: string[] = [];

    commitSelectValue('a', (value) => values.push(value));

    expect(values).toEqual(['a']);
});

test('确认框打开时不会取消', () => {
    const closed: boolean[] = [];

    dismissIfClosed(true, (ok) => closed.push(ok));

    expect(closed).toEqual([]);
});

test('确认框关闭时取消', () => {
    const closed: boolean[] = [];

    dismissIfClosed(false, (ok) => closed.push(ok));

    expect(closed).toEqual([false]);
});

test('状态标签未知值走描边样式', async () => {
    await render(<RunStatusTag status={'other' as 'success'} />);

    expect(document.querySelector('[data-slot="badge"]')?.getAttribute('data-variant')).toBe(
        'outline',
    );
});

test('徽章可渲染为链接', async () => {
    await render(
        <Badge asChild>
            <a href='/history/1'>详情</a>
        </Badge>,
    );

    expect(document.querySelector('a')?.getAttribute('href')).toBe('/history/1');
});

test('选择框占位项不会回传空值', async () => {
    const values: string[] = [];
    await render(
        <SelectField
            placeholder='请选择'
            options={[{ label: '甲', value: 'a' }]}
            onValueChange={(value) => values.push(value)}
        />,
    );
    await flush(() => {
        document
            .querySelector('[role="combobox"]')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const placeholder = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (item) => item.textContent === '请选择',
    );
    await click(placeholder!);

    expect(values).toEqual([]);
});

test('关闭确认框视为取消', async () => {
    await render(<ConfirmHost />);
    let pending!: Promise<boolean>;
    await flush(() => {
        pending = confirmAction({
            title: '删除？',
            description: '不可恢复',
            confirmLabel: '删除',
        });
    });
    await click(button('取消'));

    expect(await pending).toBe(false);
});
