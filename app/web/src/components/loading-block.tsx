import { Loader2 } from 'lucide-react';

export function LoadingBlock({ className = 'py-10' }: { className?: string }) {
    return (
        <div className={`flex justify-center ${className}`}>
            <Loader2 className='size-6 animate-spin text-muted-foreground' />
        </div>
    );
}
