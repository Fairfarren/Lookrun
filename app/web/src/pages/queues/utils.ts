import { t } from '../../i18n';
import { translateError } from '../../i18n/errors';
export function startQueueFeedback(input: {
    name: string;
    started: number;
    queued: number;
    errors: string[];
}) {
    if (input.errors.length > 0) {
        return {
            type: 'warning' as const,
            text: t('已启动 {p0} 个任务，{p1} 个被跳过：{p2}', {
                p0: input.started + input.queued,
                p1: input.errors.length,
                p2: input.errors.map(translateError).join('；'),
            }),
        };
    }
    return {
        type: 'success' as const,
        text: t('已启动队列「{p0}」：{p1} 个立即执行，{p2} 个排队', {
            p0: input.name,
            p1: input.started,
            p2: input.queued,
        }),
    };
}
