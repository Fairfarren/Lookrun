export function queuesViewState(input: { loading: boolean; count: number }) {
    if (input.loading) {
        return 'loading';
    }
    if (input.count === 0) {
        return 'empty';
    }
    return 'ready';
}
