import { errorText } from './error-text';

export async function runConfirmedDelete(input: {
    confirmed: boolean;
    remove: () => Promise<void>;
    onSuccess: () => void;
    onError: (message: string) => void;
}) {
    if (!input.confirmed) {
        return;
    }
    await deleteAndReport(input);
}

async function deleteAndReport(input: {
    remove: () => Promise<void>;
    onSuccess: () => void;
    onError: (message: string) => void;
}) {
    try {
        await input.remove();
        input.onSuccess();
    } catch (error) {
        input.onError(errorText(error));
    }
}
