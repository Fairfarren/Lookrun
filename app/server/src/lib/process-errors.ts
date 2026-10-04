export function processErrorLogLine(kind: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `${kind}：${message}`;
}

export function installProcessErrorHandlers(
    target: NodeJS.Process,
    write?: (line: string) => void,
) {
    const output = write ?? console.error;
    const log = (kind: string, error: unknown) => {
        output(processErrorLogLine(kind, error));
    };
    target.on('unhandledRejection', (error) => log('未处理的 Promise 拒绝', error));
    target.on('uncaughtException', (error) => log('未捕获异常', error));
}
