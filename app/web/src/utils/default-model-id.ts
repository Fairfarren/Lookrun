export function defaultModelId(selected: string | null | undefined, firstId: string | undefined) {
    if (selected) {
        return selected;
    }
    return firstId;
}
