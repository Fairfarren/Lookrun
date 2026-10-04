import { t, useLocale } from '../../../i18n';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { LoadingBlock } from '../../../components/loading-block';

export function QueuesLoading({ state }: { state: string }) {
    useLocale();

    if (state !== 'loading') {
        return null;
    }
    return <LoadingBlock />;
}

export function QueuesEmpty({ state }: { state: string }) {
    useLocale();

    if (state !== 'empty') {
        return null;
    }
    return <EmptyState text={t('还没有队列，点击右上角新建一个')} />;
}

export function QueuesReady({ state, children }: { state: string; children: ReactNode }) {
    useLocale();

    if (state !== 'ready') {
        return null;
    }
    return children;
}
