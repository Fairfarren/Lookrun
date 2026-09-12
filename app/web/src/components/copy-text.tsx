import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { notify } from './notify';
import { Button } from '@/components/ui/button';
import { copyWithNotify } from '@/utils/clipboard';

export function CopyText({ text, children }: { text: string; children?: ReactNode }) {
    return (
        <span className='inline-flex items-center gap-1 break-all'>
            {children ?? text}
            <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                aria-label='复制'
                onClick={() => {
                    void copyWithNotify({
                        text,
                        writeText: (value) => navigator.clipboard.writeText(value),
                        onSuccess: notify.success,
                        onError: notify.error,
                    });
                }}
            >
                <Copy />
            </Button>
        </span>
    );
}
