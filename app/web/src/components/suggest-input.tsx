import { useId } from 'react';
import { Input } from '@/components/ui/input';

export function SuggestInput({
    value,
    onValueChange,
    options,
    placeholder,
    className,
}: {
    value: string;
    onValueChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
}) {
    const listId = useId();
    return (
        <>
            <Input
                className={className}
                list={listId}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onValueChange(event.target.value)}
            />
            <datalist id={listId}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </datalist>
        </>
    );
}
