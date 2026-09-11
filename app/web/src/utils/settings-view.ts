export function emptyVariableRow() {
    return { key: '', value: '' };
}

export function variablesFromRecord(vars: Record<string, string>) {
    return Object.entries(vars).map(([key, value]) => ({ key, value }));
}

export function variablesToRecord(rows: { key: string; value: string }[]) {
    return Object.fromEntries(rows.map((row) => [row.key.trim(), row.value]));
}

export function emptyVariableName(rows: { key: string }[]) {
    return rows.some((row) => row.key.trim() === '');
}

export function defaultModelId(selected: string | null | undefined, firstId: string | undefined) {
    if (selected) {
        return selected;
    }
    return firstId;
}

export function checkAlertType(ok: boolean) {
    if (ok) {
        return 'success' as const;
    }
    return 'error' as const;
}

export function checkResultFromError(error: unknown) {
    if (error instanceof Error) {
        return { ok: false, message: error.message };
    }
    return { ok: false, message: String(error) };
}
