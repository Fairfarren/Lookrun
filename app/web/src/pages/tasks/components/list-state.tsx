import { t, useLocale } from '../../../i18n';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { LoadingBlock } from '../../../components/loading-block';

export function TasksLoading({ state }: { state: string }) {
    if (state !== 'loading') {
        return null;
    }
    return <LoadingBlock />;
}

export function TasksEmpty({ state }: { state: string }) {
    useLocale();

    if (state !== 'empty') {
        return null;
    }
    return <EmptyState text={t('还没有任务，点击右上角新建一个')} />;
}

export function TasksReady({ state, children }: { state: string; children: ReactNode }) {
    if (state !== 'ready') {
        return null;
    }
    return children;
}
