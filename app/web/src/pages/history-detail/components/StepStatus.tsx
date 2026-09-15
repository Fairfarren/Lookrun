import { Badge } from '@/components/ui/badge';
import { stepStatusTag } from '@/pages/history-detail/utils';

export function StepStatus({ status }: { status: string }) {
    const tag = stepStatusTag(status);
    return <Badge variant={tag.color === 'success' ? 'success' : 'destructive'}>{tag.text}</Badge>;
}
