export function EmptyState({ text }: { text: string }) {
    return (
        <div className='flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground'>
            {text}
        </div>
    );
}
