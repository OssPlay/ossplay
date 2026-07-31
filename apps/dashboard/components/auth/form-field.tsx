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
  autoComplete?: React.InputHTMLAttributes<HTMLInputElement>['autoComplete'];
  autoFocus?: React.InputHTMLAttributes<HTMLInputElement>['autoFocus'];
  disabled?: boolean;
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
  autoComplete,
  autoFocus,
  disabled,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base font-medium text-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
