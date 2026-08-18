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
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { SshKeyOption } from "@/types/instance";

export function AddServerDialog({
	open,
	onOpenChange,
	sshKeys,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sshKeys: SshKeyOption[];
	onAdded: () => void;
}) {
	const [label, setLabel] = useState("");
	const [host, setHost] = useState("");
	const [port, setPort] = useState("22");
	const [sshUsername, setSshUsername] = useState("root");
	const [sshKeyId, setSshKeyId] = useState("");

	const create = useAction(
		() =>
			apiFetch("/instance/servers", {
				method: "POST",
				body: JSON.stringify({
					label,
					host,
					port: Number(port),
					sshUsername,
					sshKeyId,
				}),
			}),
		{ success: "Server added", error: "Could not add server" },
	);

	// Reset on close, not open: the header's "Add server" button sets `open`
	// directly (bypassing this handler entirely), so a reset-on-open branch
	// never actually runs on that path — the dialog would reopen still
	// showing the previous server's values. Every close path (Escape,
	// overlay click, a successful submit) does go through this handler, so
	// resetting here covers all of them regardless of how it opened. Same
	// fix as instance/users/page.tsx's InviteUserDialog.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setLabel("");
			setHost("");
			setPort("22");
			setSshUsername("root");
			setSshKeyId(sshKeys[0]?.id ?? "");
			create.reset();
		}
		onOpenChange(next);
	}

	async function handleCreate() {
		await create
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onAdded();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Add remote server</DialogTitle>
				</DialogHeader>
				{sshKeys.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Add an SSH key first — a remote server needs one to connect with.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						<FormField
							id="serverLabel"
							label="Label"
							value={label}
							onChange={setLabel}
							autoComplete="off"
							autoFocus
							disabled={create.isLoading}
						/>
						<div className="flex gap-4 flex-nowrap">
							<FormField
								id="serverHost"
								label="Host"
								value={host}
								onChange={setHost}
								autoComplete="off"
								disabled={create.isLoading}
							/>
							<FormField
								id="serverPort"
								label="Port"
								value={port}
								onChange={setPort}
								autoComplete="off"
								type="number"
								disabled={create.isLoading}
							/>
						</div>
						<FormField
							id="serverSshUsername"
							label="SSH username"
							value={sshUsername}
							onChange={setSshUsername}
							autoComplete="off"
							disabled={create.isLoading}
						/>
						<div className="flex flex-col gap-1.5 w-full">
							<span className="text-base font-medium text-foreground">SSH key</span>
							<Select
								value={sshKeyId}
								onValueChange={(value) => setSshKeyId(value ?? "")}
								disabled={create.isLoading}
							>
								<SelectTrigger className="w-full">
									<SelectValue
										items={sshKeys.map((key) => ({ value: key.id, label: key.label }))}
									/>
								</SelectTrigger>
								<SelectContent>
									{sshKeys.map((key) => (
										<SelectItem key={key.id} value={key.id}>
											{key.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<FormError
							message={create.error ? errorMessage(create.error, "Could not add server") : null}
						/>
					</div>
				)}
				<DialogFooter>
					<LoadingButton
						loading={create.isLoading}
						onClick={handleCreate}
						disabled={sshKeys.length === 0 || !label || !host || !port || !sshUsername || !sshKeyId}
					>
						Add server
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
