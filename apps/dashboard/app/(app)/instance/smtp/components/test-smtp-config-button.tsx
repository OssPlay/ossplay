"use client";

import { SendIcon } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

export function TestSmtpConfigButton({
	configId,
	configName,
}: {
	configId: string;
	configName: string;
}) {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [to, setTo] = useState(user.email);

	const test = useAction(
		() =>
			apiFetch(`/instance/smtp/${configId}/test`, {
				method: "POST",
				body: JSON.stringify({ to }),
			}),
		{ error: "Could not send test email", success: "Test email sent" },
	);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) setTo(user.email);
			}}
		>
			<PopoverTrigger
				render={
					<Button variant="secondary" size="sm">
						Test
					</Button>
				}
			/>
			<PopoverContent className="w-80">
				<div className="flex flex-col gap-3">
					<FormField
						id={`smtpTestTo-${configId}`}
						label="Send test email to"
						type="email"
						value={to}
						onChange={setTo}
						autoComplete="email"
						autoFocus
						disabled={test.isLoading}
					/>
					<FormError
						message={test.error ? errorMessage(test.error, "Could not send test email") : null}
					/>
					<LoadingButton
						size="sm"
						loading={test.isLoading}
						disabled={!to}
						onClick={() =>
							test
								.trigger()
								.then(() => setOpen(false))
								.catch(() => {})
						}
					>
						<SendIcon /> Send from "{configName}"
					</LoadingButton>
				</div>
			</PopoverContent>
		</Popover>
	);
}
