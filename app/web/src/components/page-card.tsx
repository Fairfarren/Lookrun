import type { ReactNode } from 'react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { pageCardHasHeader } from '@/utils/ui-class';

export function PageCard({
    title,
    extra,
    children,
    className,
    contentClassName,
}: {
    title?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}) {
    return (
        <Card className={cn('gap-4 py-4', className)}>
            <Header title={title} extra={extra} />
            <CardContent className={cn('px-6', contentClassName)}>{children}</CardContent>
        </Card>
    );
}

function Header({ title, extra }: { title?: ReactNode; extra?: ReactNode }) {
    if (!pageCardHasHeader(title !== undefined, extra !== undefined)) {
        return null;
    }
    return (
        <CardHeader className='border-b px-6 pb-4 [.border-b]:pb-4'>
            <CardTitle className='text-base'>{title}</CardTitle>
            <Extra extra={extra} />
        </CardHeader>
    );
}

function Extra({ extra }: { extra?: ReactNode }) {
    if (extra === undefined) {
        return null;
    }
    return <CardAction>{extra}</CardAction>;
}
