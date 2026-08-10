"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ScrollTextIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError } from "@/lib/api";
import { formatDatetime } from "@/lib/utils";

interface AuditLogRow {
	id: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	metadata: Record<string, unknown> | null;
	ipAddress: string | null;
	createdAt: string;
	actorUserId: string | null;
	actorName: string | null;
	actorEmail: string | null;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="grid grid-cols-3 gap-4 py-2 text-sm border-b last:border-b-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="col-span-2 break-words">{value}</dd>
		</div>
	);
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
	const { instance } = useAuth();
	const table = useServerTable<AuditLogsResponse, AuditLogRow>({
		endpoint: "/instance/audit-logs",
		items: (response) => response.logs,
	});
	const { data: actionsData } = useSWR<{ actions: string[] }>("/instance/audit-logs/actions");
	const forbidden = table.error instanceof ApiError && table.error.status === 403;
	const [detail, setDetail] = useState<AuditLogRow | null>(null);

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
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/audit-logs` }
					: undefined,
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				onRowClick={setDetail}
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

			<Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Audit log entry</DialogTitle>
						<DialogDescription>
							Full detail for this event, including raw metadata.
						</DialogDescription>
					</DialogHeader>
					{detail && (
						<dl>
							<DetailField
								label="Action"
								value={
									<Badge variant="secondary" className="font-mono">
										{detail.action}
									</Badge>
								}
							/>
							<DetailField label="When" value={formatDatetime(detail.createdAt)} />
							<DetailField
								label="Actor"
								value={
									detail.actorName
										? `${detail.actorName} <${detail.actorEmail}>`
										: (detail.actorEmail ?? "System")
								}
							/>
							{detail.actorUserId && (
								<DetailField
									label="Actor ID"
									value={<code className="text-xs">{detail.actorUserId}</code>}
								/>
							)}
							<DetailField
								label="Target"
								value={
									detail.targetType ? (
										<>
											{detail.targetType}
											{detail.targetId && (
												<>
													{" · "}
													<code className="text-xs">{detail.targetId}</code>
												</>
											)}
										</>
									) : (
										"—"
									)
								}
							/>
							<DetailField label="IP address" value={detail.ipAddress ?? "—"} />
							<DetailField label="Entry ID" value={<code className="text-xs">{detail.id}</code>} />
							<DetailField
								label="Metadata"
								value={
									detail.metadata && Object.keys(detail.metadata).length > 0 ? (
										<pre className="overflow-x-auto p-2 text-xs rounded-md bg-muted">
											{JSON.stringify(detail.metadata, null, 2)}
										</pre>
									) : (
										"—"
									)
								}
							/>
						</dl>
					)}
				</DialogContent>
			</Dialog>
		</Container>
	);
}
