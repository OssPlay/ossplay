"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { HardDriveIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { useServerTable } from "@/hooks/use-server-table";
import type { RemoteServerRow, ServerStatus, SshKeyOption } from "@/types/instance";
import { AddServerDialog } from "./components/add-server-dialog";
import { RemoteServerRowActions } from "./components/remote-server-row-actions";

interface RemoteServersResponse {
	servers: RemoteServerRow[];
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
	const table = useServerTable<RemoteServersResponse, RemoteServerRow>({
		endpoint: "/instance/servers",
		items: (response) => response.servers,
	});
	// Large enough that the "which SSH key" picker below won't silently miss
	// any real instance's key list without needing its own unpaginated
	// endpoint just for this.
	const { data: keysData } = useSWR<{ keys: SshKeyOption[] }>("/instance/ssh-keys?per_page=100");
	const [dialogOpen, setDialogOpen] = useState(false);
	const forbidden = useInstanceRoleGate(table.error);

	if (forbidden) {
		return <InstanceForbidden />;
	}

	const sshKeys = keysData?.keys ?? [];

	const columns: DataTableColumn<RemoteServerRow>[] = [
		{ key: "label", title: "Label", sortable: true },
		{
			key: "host",
			title: "Host",
			sortable: true,
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
