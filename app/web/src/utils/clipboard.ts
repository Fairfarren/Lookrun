import { errorText } from './error-text';

export async function copyWithNotify(input: {
    text: string;
    writeText: (value: string) => Promise<void>;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}) {
    try {
        await input.writeText(input.text);
        input.onSuccess('已复制');
    } catch (error) {
        input.onError(errorText(error));
    }
}
