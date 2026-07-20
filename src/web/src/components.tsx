import { Tag } from 'antd';
import type { RunStatus } from '../../shared/types';

const STATUS_META: Record<RunStatus, { color: string; text: string }> = {
  running: { color: 'processing', text: '运行中' },
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  stopped: { color: 'warning', text: '已停止' },
};

export function RunStatusTag({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status] ?? { color: 'default', text: status };
  return <Tag color={meta.color}>{meta.text}</Tag>;
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
