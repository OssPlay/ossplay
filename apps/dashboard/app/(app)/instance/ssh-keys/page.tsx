"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
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
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { useServerTable } from "@/hooks/use-server-table";
import { apiFetch, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SshKeyGen, SshKeyRow, SshKeyType } from "@/types/instance";

interface SshKeysResponse {
	keys: SshKeyRow[];
	total: number;
	page: number;
	pageSize: number;
}

const KEY_TYPE_LABELS: Record<SshKeyType, string> = {
	"ssh-rsa": "RSA",
	"ssh-ed25519": "ED25519",
};

export default function InstanceSshKeysPage() {
	const { instance } = useAuth();
	const table = useServerTable<SshKeysResponse, SshKeyRow>({
		endpoint: "/instance/ssh-keys",
		items: (response) => response.keys,
	});
	const [dialogOpen, setDialogOpen] = useState(false);
	const forbidden = useInstanceRoleGate(table.error);

	const deleteMany = useAction((ids: string[]) =>
		Promise.allSettled(ids.map((id) => apiFetch(`/instance/ssh-keys/${id}`, { method: "DELETE" }))),
	);

	if (forbidden) {
		return <InstanceForbidden />;
	}

	const columns: DataTableColumn<SshKeyRow>[] = [
		{ key: "label", title: "Label", sortable: true },
		{ key: "fingerprint", title: "Fingerprint", formatter: "code" },
		{
			key: "keyType",
			title: "Type / Servers",
			cell: (row) => (
				<span className="inline-flex gap-2">
					<Badge
						className={cn({
							"bg-amber-700 dark:bg-amber-700": row.keyType === "ssh-rsa",
							"bg-cyan-700 dark:bg-cyan-700": row.keyType === "ssh-ed25519",
						})}
					>
						{KEY_TYPE_LABELS[row.keyType]}
					</Badge>
					<Badge variant="secondary">{row.serverCount}</Badge>
				</span>
			),
		},
		{ key: "createdAt", title: "Created at", formatter: "datetime", sortable: true },
	];

	async function handleBulkDelete(selected: SshKeyRow[]) {
		const results = await deleteMany.trigger(selected.map((key) => key.id));
		const failedCount = results.filter((result) => result.status === "rejected").length;
		const successCount = selected.length - failedCount;
		if (failedCount > 0) {
			toast.error(
				failedCount === selected.length
					? "Could not delete the selected keys — they may still be used by a remote server."
					: `Deleted ${successCount} of ${selected.length} keys — the rest may still be used by a remote server.`,
			);
		} else {
			toast.success(successCount === 1 ? "1 key deleted" : `${successCount} keys deleted`);
		}
		table.mutate();
	}

	return (
		<Container
			header={{
				icon: KeyRoundIcon,
				title: "SSH Keys",
				description: "Key-pairs used to connect to your remote servers.",
				action: {
					icon: PlusIcon,
					title: "Add key",
					onClick: () => setDialogOpen(true),
				},
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
				searchPlaceholder="Search by label…"
				emptyTitle="No SSH keys yet"
				emptyDescription="Add one to start registering remote servers."
				facets={[
					{
						key: "type",
						title: "Type",
						options: [
							{ label: "RSA", value: "ssh-rsa" },
							{ label: "ED25519", value: "ssh-ed25519" },
						],
					},
				]}
				bulkActions={[
					{
						label: "Delete",
						variant: "destructive",
						onClick: handleBulkDelete,
						confirm: {
							title: "Delete selected keys?",
							description: "This can't be undone.",
						},
					},
				]}
				rowActions={(row) => <SshKeyRowDelete sshKey={row} onDeleted={() => table.mutate()} />}
			/>

			<AddSshKeyDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onAdded={() => table.mutate()}
			/>
		</Container>
	);
}

function SshKeyRowDelete({ sshKey, onDeleted }: { sshKey: SshKeyRow; onDeleted: () => void }) {
	const [open, setOpen] = useState(false);
	const remove = useAction(
		() => apiFetch(`/instance/ssh-keys/${sshKey.id}`, { method: "DELETE" }),
		{
			success: `"${sshKey.label}" deleted`,
			error: "Could not delete key",
		},
	);

	async function handleRemove() {
		await remove
			.trigger()
			.then(() => {
				setOpen(false);
				onDeleted();
			})
			.catch(() => {});
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
				Delete
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete "{sshKey.label}"?</AlertDialogTitle>
					<AlertDialogDescription>
						{sshKey.serverCount > 0
							? "This key is used by a remote server and can't be deleted until that server is removed."
							: "This can't be undone."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={remove.isLoading || sshKey.serverCount > 0}
						onClick={handleRemove}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function AddSshKeyDialog({
	open,
	onOpenChange,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: () => void;
}) {
	const [label, setLabel] = useState("");
	const [publicKey, setPublicKey] = useState<string>("");
	const [privateKey, setPrivateKey] = useState<string>("");

	const create = useAction(
		() =>
			apiFetch("/instance/ssh-keys", {
				method: "POST",
				body: JSON.stringify({ label, publicKey, privateKey }),
			}),
		{ error: "Could not add key", success: "Key created" },
	);

	const generate = useAction(
		(type: "rsa" | "ed25519") =>
			apiFetch<SshKeyGen>("/instance/ssh-keys/generate", {
				method: "POST",
				body: JSON.stringify({ type }),
			}),
		{
			error: "Could not generate ssh key",
			success: (data) => {
				setPublicKey(data.publicKey);
				setPrivateKey(data.privateKey);
				return `Successfully generated ${data.keyType} key pair`;
			},
		},
	);

	function handleOpenChange(next: boolean) {
		setLabel("");
		setPublicKey("");
		setPrivateKey("");
		create.reset();
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
			<DialogContent className="overflow-auto sm:max-w-2xl max-h-dvh">
				<DialogHeader>
					<DialogTitle>SSH key</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4 p-1 overflow-hidden">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => generate.trigger("rsa")}
							disabled={generate.isLoading}
						>
							Generate RSA SSH Key
						</Button>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => generate.trigger("ed25519")}
							disabled={generate.isLoading}
						>
							Generate ED25519 SSH Key
						</Button>
					</div>
					<FormField
						id="sshKeyLabel"
						label="Label"
						value={label}
						onChange={setLabel}
						autoComplete="off"
						autoFocus
						disabled={create.isLoading}
					/>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sshKeyPrivateKey">Private key (PEM)</Label>
						<Textarea
							id="sshKeyPrivateKey"
							value={privateKey}
							onChange={(e) => setPrivateKey(e.target.value)}
							rows={8}
							className="w-full overflow-auto font-mono text-xs max-h-40"
							placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
							disabled={create.isLoading}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="sshKeyPublicKey">Public key (PUB)</Label>
						<Textarea
							id="sshKeyPublicKey"
							value={publicKey}
							onChange={(e) => setPublicKey(e.target.value)}
							rows={8}
							className="w-full overflow-auto font-mono text-xs max-h-40"
							placeholder="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC"
							disabled={create.isLoading}
						/>
					</div>

					<DialogFooter className="sm:justify-between">
						<FormError
							message={create.error ? errorMessage(create.error, "Could not add key") : null}
						/>
						<LoadingButton
							className="ml-auto"
							loading={create.isLoading}
							onClick={handleCreate}
							disabled={!label || !privateKey || !publicKey}
						>
							Create
						</LoadingButton>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
