"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { HardDriveIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
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
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";

type ServerStatus = "pending" | "checking" | "online" | "offline" | "error";

interface RemoteServerRow {
	id: string;
	label: string;
	host: string;
	port: number;
	sshUsername: string;
	sshKeyId: string;
	status: ServerStatus;
	lastCheckedAt: string | null;
	lastError: string | null;
	createdAt: string;
}

interface RemoteServersResponse {
	servers: RemoteServerRow[];
	total: number;
	page: number;
	pageSize: number;
}

type SshKeyOption = { id: string; label: string };

const STATUS_VARIANT: Record<
	ServerStatus,
	"default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
	pending: "outline",
	checking: "warning",
	online: "success",
	offline: "outline",
	error: "destructive",
};

export default function InstanceServersPage() {
	const { instance } = useAuth();
	const table = useServerTable<RemoteServersResponse, RemoteServerRow>({
		endpoint: "/instance/servers",
		items: (response) => response.servers,
	});
	// Large enough that the "which SSH key" picker below won't silently miss
	// any real instance's key list without needing its own unpaginated
	// endpoint just for this.
	const { data: keysData } = useSWR<{ keys: SshKeyOption[] }>("/instance/ssh-keys?per_page=100");
	const [dialogOpen, setDialogOpen] = useState(false);
	const forbidden = table.error instanceof ApiError && table.error.status === 403;

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	const sshKeys = keysData?.keys ?? [];

	const columns: DataTableColumn<RemoteServerRow>[] = [
		{ key: "label", title: "Label" },
		{
			key: "host",
			title: "Host",
			cell: (row) => `${row.sshUsername}@${row.host}:${row.port}`,
		},
		{
			key: "status",
			title: "Status",
			cell: (row) => (
				<div className="flex flex-col gap-1">
					<Badge variant={STATUS_VARIANT[row.status]} className="w-fit capitalize">
						{row.status}
					</Badge>
					{row.status === "error" && row.lastError && (
						<span className="text-xs text-muted-foreground">{row.lastError}</span>
					)}
				</div>
			),
		},
		{ key: "lastCheckedAt", title: "Last checked", formatter: "datetime" },
	];

	return (
		<Container
			header={{
				icon: HardDriveIcon,
				title: "Remote Servers",
				description: "Register a VPS to run a worker container against.",
				action: { icon: PlusIcon, title: "Add server", onClick: () => setDialogOpen(true) },
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/remote-servers` }
					: undefined,
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				searchPlaceholder="Search by label or host…"
				emptyTitle="No remote servers yet"
				emptyDescription="Register a VPS to start running a worker container against."
				facets={[
					{
						key: "status",
						title: "Status",
						options: [
							{ label: "Pending", value: "pending" },
							{ label: "Checking", value: "checking" },
							{ label: "Online", value: "online" },
							{ label: "Offline", value: "offline" },
							{ label: "Error", value: "error" },
						],
					},
				]}
				rowActions={(row) => (
					<RemoteServerRowActions server={row} onChange={() => table.mutate()} />
				)}
			/>

			<AddServerDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				sshKeys={sshKeys}
				onAdded={() => table.mutate()}
			/>
		</Container>
	);
}

function RemoteServerRowActions({
	server,
	onChange,
}: {
	server: RemoteServerRow;
	onChange: () => void;
}) {
	const [deleteOpen, setDeleteOpen] = useState(false);

	const test = useAction(
		() => apiFetch(`/instance/servers/${server.id}/test`, { method: "POST" }),
		{
			success: "Connection test triggered",
			error: "Could not test connection",
		},
	);
	const remove = useAction(() => apiFetch(`/instance/servers/${server.id}`, { method: "DELETE" }), {
		success: `"${server.label}" removed`,
		error: "Could not remove server",
	});

	async function handleTest() {
		await test
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

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
		<div className="flex justify-end gap-2">
			<LoadingButton variant="secondary" size="sm" loading={test.isLoading} onClick={handleTest}>
				Test
			</LoadingButton>
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-block">
							<Button variant="secondary" size="sm" disabled>
								Provision worker
							</Button>
						</span>
					}
				/>
				<TooltipContent>
					Coming soon — needs a dedicated worker image that hasn't shipped yet.
				</TooltipContent>
			</Tooltip>
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
					Remove
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove "{server.label}"?</AlertDialogTitle>
						<AlertDialogDescription>This can't be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isLoading}
							onClick={handleRemove}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function AddServerDialog({
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

	function handleOpenChange(next: boolean) {
		if (next) {
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
				onOpenChange(false);
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
