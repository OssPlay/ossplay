"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { HardDriveIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useAction } from "@/hooks/use-action";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import type { ServerTable } from "@/hooks/use-server-table";
import { apiFetch } from "@/lib/api";
import type {
	ComputeDestinationRow,
	RemoteServerRow,
	ServerStatus,
	SshKeyOption,
} from "@/types/instance";
import { AddRemoteWorkerDialog } from "./components/add-remote-worker-dialog";
import { ComputeDestinationRowActions } from "./components/compute-destination-row-actions";
import { RemoteServerRowActions } from "./components/remote-server-row-actions";

// A "remote worker" is either an SSH-provisioned VPS or a serverless (AWS
// Lambda) compute destination — this union + `kind` tag is what lets one
// table/one "Add" dialog present both instead of two separate pages (see
// AddRemoteWorkerDialog's own comment for why they're one dialog).
type RemoteWorkerRow =
	| ({ kind: "ssh" } & RemoteServerRow)
	| ({ kind: "lambda" } & ComputeDestinationRow);

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
	const {
		data: serversData,
		isLoading: serversLoading,
		error: serversError,
		mutate: mutateServers,
	} = useSWR<{ servers: RemoteServerRow[] }>("/instance/servers?per_page=100");
	const {
		data: computeData,
		isLoading: computeLoading,
		error: computeError,
		mutate: mutateCompute,
	} = useSWR<{ destinations: ComputeDestinationRow[] }>(
		"/instance/compute-destinations?per_page=100",
	);
	// Large enough that the "which SSH key" picker below won't silently miss
	// any real instance's key list without needing its own unpaginated
	// endpoint just for this.
	const { data: keysData } = useSWR<{ keys: SshKeyOption[] }>("/instance/ssh-keys?per_page=100");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string[]>([]);

	const forbidden = useInstanceRoleGate(serversError ?? computeError);

	const rows: RemoteWorkerRow[] = useMemo(() => {
		const ssh = (serversData?.servers ?? []).map((s) => ({ kind: "ssh" as const, ...s }));
		const lambda = (computeData?.destinations ?? []).map((d) => ({
			kind: "lambda" as const,
			...d,
		}));
		return [...ssh, ...lambda].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [serversData, computeData]);

	// Each selected row routes to its own kind's endpoint — the two backend
	// resources this page merges (see the RemoteWorkerRow comment above)
	// don't share a delete route.
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
	const filtered = rows
		.filter((row) => !search || row.label.toLowerCase().includes(search.toLowerCase()))
		.filter((row) => statusFilter.length === 0 || statusFilter.includes(row.status));

	// This list merges two backend resources (SSH servers + Lambda compute
	// destinations) that useServerTable's normal one-endpoint binding can't
	// span — pagination/sort are client-side over the small merged set
	// instead of server-driven, but DataTable's shell (search/rows/empty
	// state) is still reused rather than hand-rolling a second table.
	const table: ServerTable<RemoteWorkerRow> = {
		items: filtered,
		total: filtered.length,
		page: 0,
		pageSize: Math.max(filtered.length, 1),
		pageCount: 1,
		isLoading: serversLoading || computeLoading,
		error: serversError ?? computeError,
		mutate: () => {
			mutateServers();
			mutateCompute();
		},
		search,
		setSearch,
		setPage: () => {},
		setPageSize: () => {},
		getFilter: (key) => (key === "status" ? statusFilter : []),
		setFilter: (key, values) => {
			if (key === "status") setStatusFilter(values);
		},
		getDateRange: () => ({ gt: null, lt: null }),
		setDateRange: () => {},
		hasActiveFilters: search.length > 0 || statusFilter.length > 0,
		resetFilters: () => {
			setSearch("");
			setStatusFilter([]);
		},
		sort: null,
		order: "asc",
		setSort: () => {},
	};

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
		mutateServers();
		mutateCompute();
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
						<RemoteServerRowActions server={row} onChange={() => mutateServers()} />
					) : (
						<ComputeDestinationRowActions destination={row} onChange={() => mutateCompute()} />
					)
				}
			/>

			<AddRemoteWorkerDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				sshKeys={sshKeys}
				onAdded={() => {
					mutateServers();
					mutateCompute();
				}}
			/>
		</Container>
	);
}
