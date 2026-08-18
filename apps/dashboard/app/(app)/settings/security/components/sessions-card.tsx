"use client";

import useSWR from "swr";
import ApiLoader from "@/components/layout/api-loader";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type SessionRow, SessionRowItem } from "./session-row-item";

export function SessionsCard() {
	const { data, isLoading, mutate } = useSWR<{ sessions: SessionRow[] }>("/auth/sessions");
	const sessions = data?.sessions ?? [];

	return (
		<ApiLoader isLoading={isLoading} skeleton={<ContainerSkeleton size="sm" rows={2} />}>
			<Container header={{ title: "Active sessions" }} size="sm">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>IP</TableHead>
							<TableHead>Device</TableHead>
							<TableHead>Created</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{sessions.map((session) => (
							<SessionRowItem key={session.id} session={session} onRevoked={() => mutate()} />
						))}
					</TableBody>
				</Table>
			</Container>
		</ApiLoader>
	);
}
