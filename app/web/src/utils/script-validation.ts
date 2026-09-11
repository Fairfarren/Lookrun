export type ScriptValidationBanner = 'pending' | 'error' | 'success';

export function scriptValidationBanner(input: { validated: boolean; errors: string[] }) {
    if (!input.validated) {
        return 'pending';
    }
    if (input.errors.length > 0) {
        return 'error';
    }
    return 'success';
}
