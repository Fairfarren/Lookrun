import { toast } from 'sonner';
import { translateError } from '../i18n/errors';

export const notify = {
    success(message: string) {
        toast.success(message);
    },
    error(message: string) {
        toast.error(translateError(message));
    },
    warning(message: string) {
        toast.warning(message);
    },
    info(message: string) {
        toast.info(message);
    },
};
