"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { SmtpConfigRow } from "@/types/instance";

export function SmtpConfigDialog({
	mode,
	config,
	open,
	onOpenChange,
	onSaved,
}: {
	mode: "create" | "edit";
	config?: SmtpConfigRow;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [name, setName] = useState(config?.name ?? "");
	const [host, setHost] = useState(config?.host ?? "");
	const [port, setPort] = useState(config ? String(config.port) : "");
	const [username, setUsername] = useState(config?.username ?? "");
	const [password, setPassword] = useState("");
	const [fromAddress, setFromAddress] = useState(config?.fromAddress ?? "");
	const [fromName, setFromName] = useState(config?.fromName ?? "");
	const [secure, setSecure] = useState(config?.secure ?? true);

	// Reset on close, not open: the "Add config"/"Manage" button that opens
	// this dialog sets `open` directly (bypassing this handler entirely), so
	// a reset-on-open branch never actually runs on that path — the dialog
	// would reopen still showing the previous config's values. Every close
	// path (Escape, overlay click, a successful save) does go through this
	// handler, so resetting here covers all of them regardless of how it
	// opened. Same fix as instance/users/page.tsx's InviteUserDialog.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setName(config?.name ?? "");
			setHost(config?.host ?? "");
			setPort(config ? String(config.port) : "");
			setUsername(config?.username ?? "");
			setPassword("");
			setFromAddress(config?.fromAddress ?? "");
			setFromName(config?.fromName ?? "");
			setSecure(config?.secure ?? true);
		}
		onOpenChange(next);
	}

	const save = useAction(
		() =>
			apiFetch(mode === "edit" && config ? `/instance/smtp/${config.id}` : "/instance/smtp", {
				method: mode === "edit" ? "PUT" : "POST",
				body: JSON.stringify({
					name,
					host,
					port: Number(port),
					username: username || null,
					...(mode === "edit" ? (password ? { password } : {}) : { password: password || null }),
					fromAddress,
					fromName: fromName || null,
					secure,
				}),
			}),
		{
			success: mode === "edit" ? `"${config?.name}" updated` : "SMTP config created",
			error: mode === "edit" ? "Could not update SMTP config" : "Could not create SMTP config",
		},
	);

	async function handleSave() {
		await save
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onSaved();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "edit" ? `Edit "${config?.name}"` : "Add SMTP config"}
					</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<FormField
						id={`smtpName-${mode}`}
						label="Name"
						value={name}
						onChange={setName}
						autoComplete="off"
						autoFocus
						disabled={save.isLoading}
						placeholder="Google"
					/>
					<div className="flex gap-4 flex-nowrap">
						<FormField
							id={`smtpHost-${mode}`}
							label="Host"
							value={host}
							onChange={setHost}
							autoComplete="off"
							disabled={save.isLoading}
							placeholder="smtp.gmail.com"
						/>
						<FormField
							id={`smtpPort-${mode}`}
							label="Port"
							value={port}
							onChange={setPort}
							autoComplete="off"
							disabled={save.isLoading}
							type="number"
							placeholder="587"
						/>
					</div>
					<FormField
						id={`smtpUsername-${mode}`}
						label="Username"
						value={username}
						onChange={setUsername}
						autoComplete="off"
						disabled={save.isLoading}
						placeholder="your-email@example.com"
					/>
					<FormField
						id={`smtpPassword-${mode}`}
						label="Password"
						type="password"
						value={password}
						onChange={setPassword}
						autoComplete="new-password"
						helpText={mode === "edit" ? "Leave blank to keep the current password." : undefined}
						disabled={save.isLoading}
						placeholder="**********"
					/>
					<div className="flex gap-4 flex-nowrap">
						<FormField
							id={`smtpFromName-${mode}`}
							label="From name"
							value={fromName}
							onChange={setFromName}
							autoComplete="off"
							disabled={save.isLoading}
							placeholder="OSSPlay"
						/>
						<FormField
							id={`smtpFromAddress-${mode}`}
							label="From address"
							type="email"
							value={fromAddress}
							onChange={setFromAddress}
							autoComplete="off"
							disabled={save.isLoading}
							placeholder="example@example.com"
						/>
					</div>
					<FormError
						message={
							save.error
								? errorMessage(
										save.error,
										mode === "edit"
											? "Could not update SMTP config"
											: "Could not create SMTP config",
									)
								: null
						}
					/>
				</div>
				<DialogFooter className="sm:justify-between">
					<div className="flex items-center gap-2">
						<Switch
							id={`smtpSecure-${mode}`}
							checked={secure}
							onCheckedChange={setSecure}
							disabled={save.isLoading}
						/>
						<Label htmlFor={`smtpSecure-${mode}`}>Use TLS</Label>
					</div>
					<LoadingButton
						loading={save.isLoading}
						onClick={handleSave}
						disabled={!name || !host || !port || !fromAddress}
					>
						{mode === "edit" ? "Save" : "Create"}
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
