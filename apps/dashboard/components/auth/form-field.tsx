import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormFieldProps = {
	id: string;
	label: string;
	type?: React.HTMLInputTypeAttribute;
	value: string;
	onChange: (value: string) => void;
	required?: boolean;
	minLength?: number;
	helpText?: string;
	autoComplete?: React.InputHTMLAttributes<HTMLInputElement>["autoComplete"];
	autoFocus?: React.InputHTMLAttributes<HTMLInputElement>["autoFocus"];
	disabled?: boolean;
	placeholder?: string;
};

export function FormField({
	id,
	label,
	type = "text",
	value,
	onChange,
	required,
	minLength,
	helpText,
	autoComplete,
	autoFocus,
	disabled,
	placeholder,
}: FormFieldProps) {
	const [revealed, setRevealed] = useState(false);
	const isPassword = type === "password";

	return (
		<div className="flex flex-col gap-1.5 w-full">
			<Label htmlFor={id} className="text-base font-medium text-foreground">
				{label}
			</Label>
			<div className="relative">
				<Input
					id={id}
					type={isPassword && revealed ? "text" : type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					required={required}
					minLength={minLength}
					autoComplete={autoComplete}
					autoFocus={autoFocus}
					disabled={disabled}
					className={isPassword ? "pr-10" : undefined}
					placeholder={placeholder}
				/>
				{isPassword && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={disabled}
						aria-controls={id}
						aria-label={revealed ? "Hide password" : "Show password"}
						onClick={() => setRevealed((prev) => !prev)}
						className="absolute -translate-y-1/2 right-1 top-1/2 text-muted-foreground hover:text-foreground"
					>
						{revealed ? <EyeOffIcon /> : <EyeIcon />}
					</Button>
				)}
			</div>
			{helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
		</div>
	);
}
