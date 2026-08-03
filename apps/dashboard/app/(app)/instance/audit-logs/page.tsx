"use client";

import { ScrollTextIcon } from "lucide-react";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError } from "@/lib/api";

interface AuditLogRow {
	id: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	ipAddress: string | null;
	createdAt: string;
	actorName: string | null;
	actorEmail: string | null;
}

interface AuditLogsResponse {
	logs: AuditLogRow[];
	total: number;
	page: number;
	pageSize: number;
}

const columns: DataTableColumn<AuditLogRow>[] = [
	{ key: "createdAt", title: "When", formatter: "datetime" },
	{
		key: "actorName",
		title: "Actor",
		cell: (row) =>
			row.actorName ? `${row.actorName} <${row.actorEmail}>` : (row.actorEmail ?? "System"),
	},
	{
		key: "action",
		title: "Action",
		cell: (row) => (
			<Badge variant="secondary" className="font-mono">
				{row.action}
			</Badge>
		),
	},
	{
		key: "targetType",
		title: "Target",
		className: "text-muted-foreground",
		cell: (row) =>
			row.targetType ? `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ""}` : "—",
	},
	{
		key: "ipAddress",
		title: "IP",
		className: "text-muted-foreground",
		cell: (row) => row.ipAddress ?? "—",
	},
];

export default function InstanceAuditLogsPage() {
	const table = useServerTable<AuditLogsResponse, AuditLogRow>({
		endpoint: "/instance/audit-logs",
		items: (response) => response.logs,
	});
	const { data: actionsData } = useSWR<{ actions: string[] }>("/instance/audit-logs/actions");
	const forbidden = table.error instanceof ApiError && table.error.status === 403;

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	return (
		<Container
			header={{
				icon: ScrollTextIcon,
				title: "Audit Logs",
				description: "A record of instance-level changes.",
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				searchPlaceholder="Search actor name or email…"
				emptyTitle="No matching audit log entries"
				facets={[
					{
						key: "action",
						title: "Action",
						options: (actionsData?.actions ?? []).map((action) => ({
							label: action,
							value: action,
						})),
					},
				]}
			/>
		</Container>
	);
}
