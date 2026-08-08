"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
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

interface ErrorLogRow {
	id: string;
	source: string;
	message: string;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="grid grid-cols-3 gap-4 py-2 text-sm border-b last:border-b-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="col-span-2 break-words">{value}</dd>
		</div>
	);
}

interface ErrorLogsResponse {
	logs: ErrorLogRow[];
	total: number;
	page: number;
	pageSize: number;
}

const columns: DataTableColumn<ErrorLogRow>[] = [
	{ key: "createdAt", title: "When", formatter: "datetime" },
	{
		key: "source",
		title: "Source",
		cell: (row) => (
			<Badge variant="secondary" className="font-mono">
				{row.source}
			</Badge>
		),
	},
	{ key: "message", title: "Message", className: "max-w-md truncate" },
];

// Distinct from Audit Logs: this records the system trying and failing on
// its own (a mail send behind a swallowed catch, etc.), not an action
// someone took — see apps/api/src/lib/system-log.ts.
export default function InstanceErrorLogsPage() {
	const table = useServerTable<ErrorLogsResponse, ErrorLogRow>({
		endpoint: "/instance/error-logs",
		items: (response) => response.logs,
	});
	const { data: sourcesData } = useSWR<{ sources: string[] }>("/instance/error-logs/sources");
	const forbidden = table.error instanceof ApiError && table.error.status === 403;
	const [detail, setDetail] = useState<ErrorLogRow | null>(null);

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	return (
		<Container
			header={{
				icon: TriangleAlertIcon,
				title: "Error Logs",
				description: "Backend failures that don't otherwise surface anywhere else.",
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				onRowClick={setDetail}
				searchPlaceholder="Search message…"
				emptyTitle="No error log entries"
				facets={[
					{
						key: "source",
						title: "Source",
						options: (sourcesData?.sources ?? []).map((source) => ({
							label: source,
							value: source,
						})),
					},
				]}
			/>

			<Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Error log entry</DialogTitle>
						<DialogDescription>
							Full detail for this event, including raw metadata.
						</DialogDescription>
					</DialogHeader>
					{detail && (
						<dl>
							<DetailField
								label="Source"
								value={
									<Badge variant="secondary" className="font-mono">
										{detail.source}
									</Badge>
								}
							/>
							<DetailField label="When" value={formatDatetime(detail.createdAt)} />
							<DetailField label="Message" value={detail.message} />
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
