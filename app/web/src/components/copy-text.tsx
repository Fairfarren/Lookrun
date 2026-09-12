import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { notify } from './notify';
import { Button } from '@/components/ui/button';

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
                    void navigator.clipboard.writeText(text);
                    notify.success('已复制');
                }}
            >
                <Copy />
            </Button>
        </span>
    );
}
