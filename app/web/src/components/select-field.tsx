import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const EMPTY = '__empty__';

export function SelectField({
    value,
    onValueChange,
    options,
    placeholder,
    className,
    disabled,
}: {
    value?: string;
    onValueChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}) {
    return (
        <Select
            value={value || EMPTY}
            onValueChange={(next) => {
                if (next !== EMPTY) {
                    onValueChange(next);
                }
            }}
            disabled={disabled}
        >
            <SelectTrigger className={cn('min-w-[8rem] max-w-full', className)}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={EMPTY} disabled className='hidden'>
                    {placeholder}
                </SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
