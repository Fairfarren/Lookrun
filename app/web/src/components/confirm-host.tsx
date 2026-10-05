import { t, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { setConfirmHandler, type ConfirmRequest } from './confirm';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function dismissIfClosed(open: boolean, close: (ok: boolean) => void) {
    if (!open) close(false);
}

export function ConfirmHost() {
    useLocale();

    const [request, setRequest] = useState<ConfirmRequest | null>(null);
    const resolveRef = useRef<((ok: boolean) => void) | null>(null);

    useEffect(() => {
        setConfirmHandler((next) => {
            return new Promise((done) => {
                resolveRef.current = done;
                setRequest(next);
            });
        });
        return () => setConfirmHandler(null);
    }, []);

    const close = (ok: boolean) => {
        resolveRef.current?.(ok);
        resolveRef.current = null;
        setRequest(null);
    };

    return (
        <AlertDialog open={request !== null} onOpenChange={(open) => dismissIfClosed(open, close)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{request?.title}</AlertDialogTitle>
                    <AlertDialogDescription>{request?.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('取消')}</AlertDialogCancel>
                    <AlertDialogAction
                        variant={request?.destructive ? 'destructive' : 'default'}
                        onClick={() => close(true)}
                    >
                        {request?.confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
