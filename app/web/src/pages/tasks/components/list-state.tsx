import { Empty, Spin } from 'antd';
import type { ReactNode } from 'react';

export function TasksLoading({ state }: { state: string }) {
    if (state !== 'loading') {
        return null;
    }
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
}

export function TasksEmpty({ state }: { state: string }) {
    if (state !== 'empty') {
        return null;
    }
    return <Empty description='还没有任务，点击右上角新建一个' />;
}

export function TasksReady({ state, children }: { state: string; children: ReactNode }) {
    if (state !== 'ready') {
        return null;
    }
    return children;
}
