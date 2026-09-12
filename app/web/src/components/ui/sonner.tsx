import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useThemeMode } from '@/theme/context';

export function Toaster(props: ToasterProps) {
    const themeMode = useThemeMode();
    return (
        <Sonner
            theme={themeMode}
            className='toaster group'
            position='bottom-right'
            icons={{
                success: <CircleCheckIcon className='size-4' />,
                info: <InfoIcon className='size-4' />,
                warning: <TriangleAlertIcon className='size-4' />,
                error: <OctagonXIcon className='size-4' />,
                loading: <Loader2Icon className='size-4 animate-spin' />,
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                } as Record<string, string>
            }
            {...props}
        />
    );
}
