import type { ReactNode } from 'react';

export function OptionalBlock({ show, children }: { show: boolean; children: ReactNode }) {
    if (!show) {
        return null;
    }
    return children;
}
