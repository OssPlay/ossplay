"use client";

import { MailIcon, PlusIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { useAuth } from "@/components/providers/auth-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";

interface SmtpConfigRow {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string | null;
	fromAddress: string;
	fromName: string | null;
	secure: boolean;
	isDefault: boolean;
}

interface SmtpConfigsResponse {
	configs: SmtpConfigRow[];
	total: number;
	page: number;
	pageSize: number;
}

export default function InstanceSmtpPage() {
	const table = useServerTable<SmtpConfigsResponse, SmtpConfigRow>({
		endpoint: "/instance/smtp",
		items: (response) => response.configs,
	});
	const [dialogOpen, setDialogOpen] = useState(false);
	const forbidden = table.error instanceof ApiError && table.error.status === 403;

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	const columns: DataTableColumn<SmtpConfigRow>[] = [
		{ key: "name", title: "Name" },
		{ key: "host", title: "Host" },
		{
			key: "fromAddress",
			title: "From",
			cell: (row) => (row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress),
		},
		{
			key: "isDefault",
			title: "Default",
			cell: (row) =>
				row.isDefault ? (
					<Badge variant="secondary">Default</Badge>
				) : (
					<MakeDefaultButton configId={row.id} onChange={() => table.mutate()} />
				),
		},
	];

	return (
		<Container
			header={{
				icon: MailIcon,
				title: "Email & SMTP",
				description: "Used to send invitation and password-reset emails.",
				action: {
					icon: PlusIcon,
					title: "Add config",
					onClick: () => setDialogOpen(true),
				},
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				searchPlaceholder="Search by name or host…"
				emptyTitle="No SMTP configs yet"
				emptyDescription="Add one to start sending invitation and password-reset emails."
				rowActions={(row) => (
					<div className="flex justify-end gap-2">
						<TestSmtpConfigButton configId={row.id} configName={row.name} />
						<SmtpConfigManageButton config={row} onChange={() => table.mutate()} />
					</div>
				)}
			/>

			<SmtpConfigDialog
				mode="create"
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSaved={() => table.mutate()}
			/>
		</Container>
	);
}

function MakeDefaultButton({ configId, onChange }: { configId: string; onChange: () => void }) {
	const makeDefault = useAction(
		() => apiFetch(`/instance/smtp/${configId}/default`, { method: "PUT" }),
		{ error: "Could not set as default" },
	);

	return (
		<LoadingButton
			variant="secondary"
			size="sm"
			loading={makeDefault.isLoading}
			onClick={() =>
				makeDefault
					.trigger()
					.then(onChange)
					.catch(() => {})
			}
		>
			Make default
		</LoadingButton>
	);
}

function SmtpConfigManageButton({
	config,
	onChange,
}: {
	config: SmtpConfigRow;
	onChange: () => void;
}) {
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const remove = useAction(() => apiFetch(`/instance/smtp/${config.id}`, { method: "DELETE" }), {
		error: "Could not delete config",
	});

	async function handleRemove() {
		await remove
			.trigger()
			.then(() => {
				setDeleteOpen(false);
				onChange();
			})
			.catch(() => {});
	}

	return (
		<>
			<Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
				Manage
			</Button>
			<SmtpConfigDialog
				mode="edit"
				config={config}
				open={editOpen}
				onOpenChange={setEditOpen}
				onSaved={onChange}
			/>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
					Delete
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{config.name}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This SMTP config will stop being usable immediately. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isLoading}
							onClick={handleRemove}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function TestSmtpConfigButton({ configId, configName }: { configId: string; configName: string }) {
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

function SmtpConfigDialog({
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

	// Re-seeds from the current row every time the dialog opens — a prior
	// edit's leftover state (or another row's values, since this component
	// is remounted per-row but state could otherwise persist across opens)
	// must not leak into the next open.
	function handleOpenChange(next: boolean) {
		if (next) {
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
					// Create: omitting entirely vs. sending null both mean "no
					// password" server-side. Edit: an empty field means "leave the
					// stored password unchanged", which needs the key omitted rather
					// than sent as null (null would clear it) — see instance-smtp.ts.
					...(mode === "edit" ? (password ? { password } : {}) : { password: password || null }),
					fromAddress,
					fromName: fromName || null,
					secure,
				}),
			}),
		{
			error: mode === "edit" ? "Could not update SMTP config" : "Could not create SMTP config",
		},
	);

	async function handleSave() {
		await save
			.trigger()
			.then(() => {
				onOpenChange(false);
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
