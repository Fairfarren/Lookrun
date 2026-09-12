import type { RunStatus } from '@lookrun/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_META: Record<
    RunStatus,
    { variant: 'running' | 'success' | 'destructive' | 'warning'; text: string }
> = {
    running: { variant: 'running', text: '运行中' },
    success: { variant: 'success', text: '成功' },
    failed: { variant: 'destructive', text: '失败' },
    stopped: { variant: 'warning', text: '已停止' },
};

export function RunStatusTag({ status }: { status: RunStatus }) {
    const meta = STATUS_META[status] ?? { variant: 'outline' as const, text: status };
    return <Badge variant={meta.variant}>{meta.text}</Badge>;
}

export function formatDuration(ms: number | null) {
    if (ms === null || ms === undefined) {
        return '-';
    }
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTime(iso: string | null) {
    if (!iso) {
        return '-';
    }
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}
