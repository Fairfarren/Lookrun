import { Tag } from 'antd';
import { stepStatusTag } from '../utils';

export function StepStatus({ status }: { status: string }) {
    const tag = stepStatusTag(status);
    return <Tag color={tag.color}>{tag.text}</Tag>;
}
