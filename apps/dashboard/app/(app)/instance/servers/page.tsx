"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { HardDriveIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useAction } from "@/hooks/use-action";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { useServerTable } from "@/hooks/use-server-table";
import { apiFetch } from "@/lib/api";
import type { RemoteWorkerRow, ServerStatus, SshKeyOption } from "@/types/instance";
import { AddRemoteWorkerDialog } from "./components/add-remote-worker-dialog";
import { ComputeDestinationRowActions } from "./components/compute-destination-row-actions";
import { RemoteServerRowActions } from "./components/remote-server-row-actions";

interface RemoteWorkersResponse {
	workers: RemoteWorkerRow[];
	total: number;
	page: number;
	pageSize: number;
}

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
	const table = useServerTable<RemoteWorkersResponse, RemoteWorkerRow>({
		endpoint: "/instance/remote-workers",
		items: (response) => response.workers,
	});
	// Large enough that the "which SSH key" picker below won't silently miss
	// any real instance's key list without needing its own unpaginated
	// endpoint just for this.
	const { data: keysData } = useSWR<{ keys: SshKeyOption[] }>("/instance/ssh-keys?per_page=100");
	const [dialogOpen, setDialogOpen] = useState(false);

	const forbidden = useInstanceRoleGate(table.error);

	// Each selected row routes to its own kind's endpoint — the two backend
	// resources this list merges (see RemoteWorkerRow) don't share a delete
	// route.
	const deleteMany = useAction((rows: RemoteWorkerRow[]) =>
		Promise.allSettled(
			rows.map((row) =>
				row.kind === "ssh"
					? apiFetch(`/instance/servers/${row.id}`, { method: "DELETE" })
					: apiFetch(`/instance/compute-destinations/${row.id}`, { method: "DELETE" }),
			),
		),
	);

	if (forbidden) {
		return <InstanceForbidden />;
	}

	const sshKeys = keysData?.keys ?? [];

	async function handleBulkDelete(selected: RemoteWorkerRow[]) {
		const results = await deleteMany.trigger(selected);
		const failedCount = results.filter((result) => result.status === "rejected").length;
		const successCount = selected.length - failedCount;
		if (failedCount > 0) {
			toast.error(`Removed ${successCount} of ${selected.length} — some could not be removed.`);
		} else {
			toast.success(
				successCount === 1 ? "1 remote worker removed" : `${successCount} remote workers removed`,
			);
		}
		table.mutate();
	}

	const columns: DataTableColumn<RemoteWorkerRow>[] = [
		{ key: "label", title: "Label" },
		{
			key: "kind",
			title: "Type",
			cell: (row) => (row.kind === "ssh" ? "SSH VPS" : "AWS Lambda"),
		},
		{
			// "id" isn't actually rendered here (cell always overrides it) — just
			// a column key that's valid across both union members and not
			// already used by another column, since "host"/"functionArn" each
			// only exist on one of the two kinds.
			key: "id",
			title: "Address",
			cell: (row) =>
				row.kind === "ssh" ? `${row.sshUsername}@${row.host}:${row.port}` : row.functionArn,
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
				description: "Register a VPS or a serverless function to run processing jobs on.",
				action: { icon: PlusIcon, title: "Add remote worker", onClick: () => setDialogOpen(true) },
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/remote-servers` }
					: undefined,
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => `${row.kind}:${row.id}`}
				columns={columns}
				searchPlaceholder="Search by label…"
				emptyTitle="No remote workers yet"
				emptyDescription="Register a VPS or a serverless function to start running processing jobs against."
				facets={[
					{
						key: "kind",
						title: "Type",
						options: [
							{ label: "SSH VPS", value: "ssh" },
							{ label: "AWS Lambda", value: "lambda" },
						],
					},
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
				bulkActions={[
					{
						label: "Remove",
						variant: "destructive",
						onClick: handleBulkDelete,
						confirm: {
							title: "Remove selected remote workers?",
							description: "This can't be undone.",
						},
					},
				]}
				rowActions={(row) =>
					row.kind === "ssh" ? (
						<RemoteServerRowActions server={row} onChange={() => table.mutate()} />
					) : (
						<ComputeDestinationRowActions destination={row} onChange={() => table.mutate()} />
					)
				}
			/>

			<AddRemoteWorkerDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				sshKeys={sshKeys}
				onAdded={() => table.mutate()}
			/>
		</Container>
	);
}
