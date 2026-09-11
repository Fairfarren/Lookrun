export function runProgressText(input: {
    taskName: string;
    currentStepIndex: number;
    totalSteps: number;
}) {
    if (input.totalSteps <= 0 || input.currentStepIndex < 0) {
        return `${input.taskName}（准备中）`;
    }
    return `${input.taskName}（${input.currentStepIndex + 1}/${input.totalSteps}）`;
}
