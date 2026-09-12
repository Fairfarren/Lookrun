export interface ConfirmRequest {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
}

type ConfirmHandler = (request: ConfirmRequest) => Promise<boolean>;

let confirmHandler: ConfirmHandler | null = null;

export function setConfirmHandler(handler: ConfirmHandler | null) {
    confirmHandler = handler;
}

export function confirmAction(request: ConfirmRequest) {
    if (!confirmHandler) {
        throw new Error('确认框尚未挂载');
    }
    return confirmHandler(request);
}
