export function dragOverId(over: { id: unknown } | null, active: { id: unknown }) {
    return String((over ?? active).id);
}

export function applyDroppedSort<T extends { id: string }>(
    items: T[],
    drop: { over: { id: unknown } | null; active: { id: unknown } },
) {
    if (!drop.over) return items;
    return reorderById(items, String(drop.active.id), String(drop.over.id));
}

export function reorderById<T extends { id: string }>(
    items: T[],
    activeId: string,
    overId: string,
) {
    const activeIndex = items.findIndex((item) => item.id === activeId);
    const overIndex = items.findIndex((item) => item.id === overId);
    if (activeIndex === overIndex || activeIndex < 0 || overIndex < 0) {
        return items;
    }

    const reorderedItems = [...items];
    const [activeItem] = reorderedItems.splice(activeIndex, 1);
    reorderedItems.splice(overIndex, 0, activeItem);
    return reorderedItems;
}
