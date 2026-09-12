export function tokenPairText(input: number, output: number) {
    if (input + output > 0) {
        return `${input} / ${output}`;
    }
    return '-';
}

export function hasTokenUsage(input: number, output: number) {
    return input + output > 0;
}

export function stepStatusTag(status: string) {
    if (status === 'success') {
        return { color: 'success', text: '成功' };
    }
    return { color: 'error', text: '失败' };
}
