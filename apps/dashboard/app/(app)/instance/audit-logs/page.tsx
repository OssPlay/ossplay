"use client";

import { ScrollTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api";

type AuditLogRow = {
	id: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	ipAddress: string | null;
	createdAt: string;
	actorName: string | null;
	actorEmail: string | null;
};
type AuditLogsResponse = { logs: AuditLogRow[]; total: number; page: number; pageSize: number };

const ALL_ACTIONS = "__all__";
const DEBOUNCE_MS = 300;

export default function InstanceAuditLogsPage() {
	const { data: actionsData } = useSWR<{ actions: string[] }>("/instance/audit-logs/actions");
	const [actorInput, setActorInput] = useState("");
	const actor = useDebouncedValue(actorInput, DEBOUNCE_MS);
	const [action, setAction] = useState(ALL_ACTIONS);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(25);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `page` — this only resets page in response to the filters changing.
	useEffect(() => {
		setPage(0);
	}, [actor, action]);

	const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
	if (actor) query.set("actor", actor);
	if (action !== ALL_ACTIONS) query.set("action", action);

	const { data, error } = useSWR<AuditLogsResponse>(`/instance/audit-logs?${query.toString()}`);
	const forbidden = error instanceof ApiError && error.status === 403;

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}

	const logs = data?.logs ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	function handlePageSizeChange(size: number) {
		setPageSize(size);
		setPage(0);
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
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<Input
						placeholder="Search actor name or email…"
						value={actorInput}
						onChange={(e) => setActorInput(e.target.value)}
						className="max-w-xs"
					/>
					<Select value={action} onValueChange={(value) => setAction(value ?? ALL_ACTIONS)}>
						<SelectTrigger className="w-56">
							<SelectValue placeholder="All actions" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
							{(actionsData?.actions ?? []).map((a) => (
								<SelectItem key={a} value={a}>
									{a}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{!data ? null : total === 0 ? (
					<p className="text-sm text-muted-foreground">No matching audit log entries.</p>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>When</TableHead>
									<TableHead>Actor</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Target</TableHead>
									<TableHead>IP</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{logs.map((log) => (
									<TableRow key={log.id}>
										<TableCell className="whitespace-nowrap text-muted-foreground">
											{new Date(log.createdAt).toLocaleString()}
										</TableCell>
										<TableCell>
											{log.actorName
												? `${log.actorName} <${log.actorEmail}>`
												: (log.actorEmail ?? "System")}
										</TableCell>
										<TableCell>
											<Badge variant="secondary" className="font-mono">
												{log.action}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{log.targetType
												? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}`
												: "—"}
										</TableCell>
										<TableCell className="text-muted-foreground">{log.ipAddress ?? "—"}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<PaginationBar
							page={page}
							totalPages={totalPages}
							pageSize={pageSize}
							pageSizeOptions={[25, 50, 100]}
							totalCount={total}
							onPageChange={setPage}
							onPageSizeChange={handlePageSizeChange}
						/>
					</>
				)}
			</div>
		</Container>
	);
}
