import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { isBusyDisabled } from '@/utils/ui-class';

export function BusyButton({
    busy,
    children,
    disabled,
    ...props
}: ComponentProps<typeof Button> & { busy?: boolean }) {
    return (
        <Button disabled={isBusyDisabled(busy, disabled)} {...props}>
            <BusyIcon busy={busy} />
            {children}
        </Button>
    );
}

function BusyIcon({ busy }: { busy?: boolean }) {
    if (!busy) {
        return null;
    }
    return <Loader2 className='animate-spin' />;
}
