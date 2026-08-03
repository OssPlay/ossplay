"use client";

import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

// Onboarding-only: creates the instance's first SMTP config (auto-becomes
// the default — see instance-smtp.ts). Managing configs after that (add
// more, edit, make default, delete, test-send) happens on /instance/smtp,
// which is its own richer list UI, not this form.
export function SmtpForm({
	saveLabel = "Continue",
	onSaved,
}: {
	saveLabel?: string;
	onSaved?: () => void;
}) {
	const { data, isLoading: isChecking } = useSWR<{ configs: unknown[] }>("/instance/smtp");
	const alreadyConfigured = (data?.configs.length ?? 0) > 0;

	const [host, setHost] = useState("");
	const [port, setPort] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [fromAddress, setFromAddress] = useState("");
	const [fromName, setFromName] = useState("");
	const [secure, setSecure] = useState(true);

	const save = useAction(
		() =>
			apiFetch("/instance/smtp", {
				method: "POST",
				body: JSON.stringify({
					name: "Default",
					host,
					port: Number(port),
					username: username || null,
					password: password || null,
					fromAddress,
					fromName: fromName || null,
					secure,
				}),
			}),
		{ error: "Could not save SMTP settings" },
	);

	async function handleSubmit() {
		await save
			.trigger()
			.then(() => onSaved?.())
			.catch(() => {});
	}

	if (isChecking) return null;

	if (alreadyConfigured) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-sm text-muted-foreground">
					SMTP is already configured for this instance — manage it later from Instance → Email &amp;
					SMTP.
				</p>
				<LoadingButton type="button" loading={false} onClick={() => onSaved?.()}>
					{saveLabel}
				</LoadingButton>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<FormField
				id="smtpHost"
				label="Host"
				value={host}
				onChange={setHost}
				autoComplete="off"
				autoFocus
				disabled={save.isLoading}
			/>
			<FormField
				id="smtpPort"
				label="Port"
				value={port}
				onChange={setPort}
				autoComplete="off"
				disabled={save.isLoading}
			/>
			<FormField
				id="smtpUsername"
				label="Username"
				value={username}
				onChange={setUsername}
				autoComplete="off"
				disabled={save.isLoading}
			/>
			<FormField
				id="smtpPassword"
				label="Password"
				type="password"
				value={password}
				onChange={setPassword}
				autoComplete="new-password"
				disabled={save.isLoading}
			/>
			<FormField
				id="smtpFromAddress"
				label="From address"
				type="email"
				value={fromAddress}
				onChange={setFromAddress}
				autoComplete="off"
				disabled={save.isLoading}
			/>
			<FormField
				id="smtpFromName"
				label="From name"
				value={fromName}
				onChange={setFromName}
				autoComplete="off"
				disabled={save.isLoading}
			/>
			<div className="flex items-center gap-2">
				<Switch
					id="smtpSecure"
					checked={secure}
					onCheckedChange={setSecure}
					disabled={save.isLoading}
				/>
				<Label htmlFor="smtpSecure">Use TLS</Label>
			</div>
			<FormError
				message={save.error ? errorMessage(save.error, "Could not save SMTP settings") : null}
			/>
			<LoadingButton
				type="button"
				loading={save.isLoading}
				onClick={handleSubmit}
				disabled={!host || !port || !fromAddress}
			>
				{saveLabel}
			</LoadingButton>
		</div>
	);
}
