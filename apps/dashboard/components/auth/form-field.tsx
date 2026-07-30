import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormFieldProps = {
  id: string;
  label: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  helpText?: string;
};

export function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  required,
  minLength,
  helpText,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
