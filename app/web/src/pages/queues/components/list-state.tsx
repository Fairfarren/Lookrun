import { Empty, Spin } from 'antd';
import type { ReactNode } from 'react';

export function QueuesLoading({ state }: { state: string }) {
    if (state !== 'loading') {
        return null;
    }
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
}

export function QueuesEmpty({ state }: { state: string }) {
    if (state !== 'empty') {
        return null;
    }
    return <Empty description='还没有队列，点击右上角新建一个' />;
}

export function QueuesReady({ state, children }: { state: string; children: ReactNode }) {
    if (state !== 'ready') {
        return null;
    }
    return children;
}
