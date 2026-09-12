import { tokenPairText } from '../utils';

export function TokenText({ input, output }: { input: number; output: number }) {
    return <>{tokenPairText(input, output)}</>;
}
