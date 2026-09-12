export function draggingItemStyle(isDragging: boolean) {
    return {
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : undefined,
        cursor: isDragging ? 'grabbing' : 'grab',
    };
}
