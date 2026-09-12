import { Input } from '@/components/ui/input';

export function NumberInput({
    value,
    onValueChange,
    min,
    placeholder,
    className,
}: {
    value: number | undefined;
    onValueChange: (value: number | undefined) => void;
    min?: number;
    placeholder?: string;
    className?: string;
}) {
    return (
        <Input
            type='number'
            min={min}
            placeholder={placeholder}
            className={className}
            value={value ?? ''}
            onChange={(event) => onValueChange(parseOptionalNumber(event.target.value))}
        />
    );
}

function parseOptionalNumber(raw: string) {
    if (raw === '') {
        return undefined;
    }
    return Number(raw);
}
