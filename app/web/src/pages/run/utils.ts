import { t } from '../../i18n';
export function runProgressText(input: {
    taskName: string;
    currentStepIndex: number;
    totalSteps: number;
}) {
    if (input.totalSteps <= 0 || input.currentStepIndex < 0) {
        return t('{p0}（准备中）', { p0: input.taskName });
    }
    return `${input.taskName}（${input.currentStepIndex + 1}/${input.totalSteps}）`;
}
