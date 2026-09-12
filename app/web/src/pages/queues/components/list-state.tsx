import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { LoadingBlock } from '../../../components/loading-block';

export function QueuesLoading({ state }: { state: string }) {
    if (state !== 'loading') {
        return null;
    }
    return <LoadingBlock />;
}

export function QueuesEmpty({ state }: { state: string }) {
    if (state !== 'empty') {
        return null;
    }
    return <EmptyState text='还没有队列，点击右上角新建一个' />;
}

export function QueuesReady({ state, children }: { state: string; children: ReactNode }) {
    if (state !== 'ready') {
        return null;
    }
    return children;
}
