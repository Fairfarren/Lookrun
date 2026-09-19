import './helpers/dom';
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { StepFields } from '../src/pages/task-edit';
import { NumberInput } from '../src/components/number-input';
import { Input } from '../src/components/ui/input';
import { Label } from '../src/components/ui/label';
import { Toggle } from '../src/components/ui/toggle';
import { Separator } from '../src/components/ui/separator';
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverAnchor,
    PopoverHeader,
    PopoverTitle,
    PopoverDescription,
} from '../src/components/ui/popover';
import { ScrollArea, ScrollBar } from '../src/components/ui/scroll-area';
import {
    Card,
    CardHeader,
    CardDescription,
    CardContent,
    CardFooter,
    CardTitle,
} from '../src/components/ui/card';
import {
    Table,
    TableCaption,
    TableBody,
    TableRow,
    TableCell,
    TableFooter,
} from '../src/components/ui/table';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogClose,
    DialogFooter,
} from '../src/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogMedia,
    AlertDialogAction,
} from '../src/components/ui/alert-dialog';
import {
    Select,
    SelectGroup,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '../src/components/ui/select';
import {
    TooltipProvider,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '../src/components/ui/tooltip';
import { button, choose, click, flush, input, render, useDomTests } from './helpers/render';

useDomTests();

test('数字输入清空后回传 undefined，数字值保留数值类型', async () => {
    const values: (number | undefined)[] = [];
    function Form() {
        const [value, setValue] = useState<number | undefined>(3);
        return (
            <NumberInput
                value={value}
                onValueChange={(next) => {
                    values.push(next);
                    setValue(next);
                }}
            />
        );
    }
    await render(<Form />);

    await input(document.querySelector('input')!, '25');
    await input(document.querySelector('input')!, '');

    expect(values).toEqual([25, undefined]);
});

test('标签关联输入框，切换按钮传递状态，分隔线保留语义', async () => {
    let pressed = false;
    await render(
        <>
            <Label htmlFor='name'>姓名</Label>
            <Input id='name' />
            <Toggle
                onPressedChange={(value) => {
                    pressed = value;
                }}
            >
                启用筛选
            </Toggle>
            <Separator decorative={false} orientation='vertical' />
        </>,
    );

    await click(button('启用筛选'));

    expect({
        label: document.querySelector('label')?.htmlFor,
        pressed,
        aria: button('启用筛选').getAttribute('aria-pressed'),
        separator: document.querySelector('[role="separator"]')?.getAttribute('aria-orientation'),
    }).toEqual({ label: 'name', pressed: true, aria: 'true', separator: 'vertical' });
});

test('浮层触发器打开可关联说明的内容', async () => {
    await render(
        <Popover>
            <PopoverAnchor>
                <span>锚点</span>
            </PopoverAnchor>
            <PopoverTrigger>打开说明</PopoverTrigger>
            <PopoverContent>
                <PopoverHeader>
                    <PopoverTitle>参数说明</PopoverTitle>
                    <PopoverDescription>用于控制重试次数</PopoverDescription>
                </PopoverHeader>
            </PopoverContent>
        </Popover>,
    );

    await click(button('打开说明'));

    expect(document.querySelector('[role="dialog"]')?.textContent).toBe('参数说明用于控制重试次数');
});

test('对话框触发和显式关闭按钮透传交互，页脚关闭选项有效', async () => {
    await render(
        <Dialog>
            <DialogTrigger>打开详情</DialogTrigger>
            <DialogContent showCloseButton={false}>
                <DialogTitle>运行详情</DialogTitle>
                <DialogDescription>详细内容</DialogDescription>
                <DialogClose>关闭详情</DialogClose>
                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>,
    );
    await click(button('打开详情'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('详细内容');
    await click(button('关闭详情'));
    await click(button('打开详情'));

    await click(button('Close'));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('警告对话框媒体和确认动作随触发器显示并完成关闭', async () => {
    let approved = false;
    await render(
        <AlertDialog>
            <AlertDialogTrigger>请求操作</AlertDialogTrigger>
            <AlertDialogContent size='sm'>
                <AlertDialogMedia>警告</AlertDialogMedia>
                <AlertDialogTitle>确认操作</AlertDialogTitle>
                <AlertDialogDescription>操作影响说明</AlertDialogDescription>
                <AlertDialogAction
                    onClick={() => {
                        approved = true;
                    }}
                >
                    同意
                </AlertDialogAction>
            </AlertDialogContent>
        </AlertDialog>,
    );
    await click(button('请求操作'));
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('警告');

    await click(button('同意'));

    expect({ approved, dialog: document.querySelector('[role="alertdialog"]') }).toEqual({
        approved: true,
        dialog: null,
    });
});

test('下拉分组保留标签并允许选择选项', async () => {
    let selected = '';
    await render(
        <Select
            onValueChange={(value) => {
                selected = value;
            }}
        >
            <SelectTrigger>
                <SelectValue placeholder='选择模型' />
            </SelectTrigger>
            <SelectContent position='popper'>
                <SelectGroup>
                    <SelectLabel>视觉模型</SelectLabel>
                    <SelectItem value='a'>模型甲</SelectItem>
                    <SelectSeparator />
                    <SelectItem value='b'>模型乙</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>,
    );

    await choose(0, '模型乙');

    expect({ selected, display: document.querySelector('[role="combobox"]')?.textContent }).toEqual(
        { selected: 'b', display: '模型乙' },
    );
});

test('卡片和表格正确保留描述、数据与汇总语义', async () => {
    await render(
        <Card>
            <CardHeader>
                <CardTitle>统计</CardTitle>
                <CardDescription>每日运行汇总</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableCaption>运行次数</TableCaption>
                    <TableBody>
                        <TableRow>
                            <TableCell>成功</TableCell>
                            <TableCell>2</TableCell>
                        </TableRow>
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={2}>合计 2</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
            <CardFooter>更新时间 12:00</CardFooter>
        </Card>,
    );

    expect({
        caption: document.querySelector('caption')?.textContent,
        summary: document.querySelector('tfoot td')?.getAttribute('colspan'),
        description: document.querySelector('[data-slot="card-description"]')?.textContent,
        footer: document.querySelector('[data-slot="card-footer"]')?.textContent,
    }).toEqual({
        caption: '运行次数',
        summary: '2',
        description: '每日运行汇总',
        footer: '更新时间 12:00',
    });
});

test('滚动区域保留内容与双向滚动条', async () => {
    await render(
        <ScrollArea type='always'>
            <p>可滚动报告</p>
            <ScrollBar orientation='horizontal' />
        </ScrollArea>,
    );

    expect({
        content: document.querySelector('[data-slot="scroll-area-viewport"]')?.textContent,
        bars: [...document.querySelectorAll('[data-slot="scroll-area-scrollbar"]')]
            .map((item) => item.getAttribute('data-orientation'))
            .sort(),
    }).toEqual({ content: '可滚动报告', bars: ['horizontal', 'vertical'] });
});

test('键盘聚焦触发器显示辅助提示', async () => {
    await render(
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>需要帮助</TooltipTrigger>
                <TooltipContent>键盘同样可访问</TooltipContent>
            </Tooltip>
        </TooltipProvider>,
    );

    await flush(() => button('需要帮助').focus());

    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('键盘同样可访问');
});

test('未知步骤动作不渲染误导性的输入字段', async () => {
    const { container } = await render(
        <StepFields
            step={{ id: 'unknown', action: 'future-action', params: {} }}
            targetType='web'
            androidApps={[]}
            loadingApps={false}
            deviceId=''
            onChange={() => {}}
            onReloadApps={() => {}}
        />,
    );

    expect(container.childElementCount).toBe(0);
});
