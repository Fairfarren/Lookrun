export function scrollBarOrientationClass(orientation: string) {
    if (orientation === 'horizontal') {
        return 'h-2.5 flex-col border-t border-t-transparent';
    }
    return 'h-full w-2.5 border-l border-l-transparent';
}

export function selectPopperOffsetClass(position: string) {
    if (position !== 'popper') {
        return undefined;
    }
    return 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1';
}

export function selectPopperViewportClass(position: string) {
    if (position !== 'popper') {
        return undefined;
    }
    return 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1';
}

export function resolvedToggleVariant<T>(contextVariant: T | null | undefined, variant: T) {
    if (contextVariant) {
        return contextVariant;
    }
    return variant;
}

export function pageCardHasHeader(hasTitle: boolean, hasExtra: boolean) {
    if (hasTitle) {
        return true;
    }
    return hasExtra;
}

export function isBusyDisabled(busy?: boolean, disabled?: boolean) {
    if (busy) {
        return true;
    }
    return Boolean(disabled);
}

export function optionalIdString(id: number | undefined) {
    if (id === undefined) {
        return undefined;
    }
    return String(id);
}

export function stayOnTasks(feedback: { stay: boolean; message: string | null }) {
    if (!feedback.stay) {
        return false;
    }
    return Boolean(feedback.message);
}

export function androidCheckError(message?: string) {
    if (message) {
        return message;
    }
    return '检查失败';
}

export function launchFieldPlaceholder(
    loadingApps: boolean,
    fallback: string,
    loadingText: string,
) {
    if (loadingApps) {
        return loadingText;
    }
    return fallback;
}

export function fieldLabelText(placeholder: string | undefined, label: string) {
    if (placeholder) {
        return placeholder;
    }
    return label;
}

export function modelCheckVariant(ok: boolean) {
    if (ok) {
        return 'success' as const;
    }
    return 'destructive' as const;
}
