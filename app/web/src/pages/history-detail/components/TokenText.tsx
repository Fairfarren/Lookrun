import { tokenPairText } from '@/pages/history-detail/utils';

export function TokenText({ input, output }: { input: number; output: number }) {
    return <>{tokenPairText(input, output)}</>;
}
