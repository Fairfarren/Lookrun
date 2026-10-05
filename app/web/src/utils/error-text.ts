import { translateError } from '../i18n/errors';

export function errorText(error: unknown) {
    if (error instanceof Error) {
        return translateError(error.message);
    }
    return translateError(String(error));
}
