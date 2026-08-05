"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { Building2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useServerTable } from "@/hooks/use-server-table";

interface OrganizationRow {
	id: string;
	name: string;
	createdAt: string;
	memberCount: number;
	projectCount: number;
}

interface OrganizationsResponse {
	organizations: OrganizationRow[];
	total: number;
	page: number;
	pageSize: number;
}

const columns: DataTableColumn<OrganizationRow>[] = [
	{ key: "name", title: "Organization", className: "font-medium" },
	{
		key: "memberCount",
		title: "Members",
		cell: (row) => <Badge variant="secondary">{row.memberCount}</Badge>,
	},
	{
		key: "projectCount",
		title: "Projects",
		cell: (row) => <Badge variant="secondary">{row.projectCount}</Badge>,
	},
	{ key: "createdAt", title: "Created", formatter: "datetime", className: "text-muted-foreground" },
];

export default function InstanceOrganizationsPage() {
	const router = useRouter();
	const table = useServerTable<OrganizationsResponse, OrganizationRow>({
		endpoint: "/organizations",
		items: (response) => response.organizations,
	});

	return (
		<Container
			header={{
				icon: Building2Icon,
				title: "Organizations",
				description: "Every organization on this instance.",
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				onRowClick={(row) => router.push(`/instance/organizations/${row.id}`)}
				searchPlaceholder="Search organizations…"
				emptyTitle="No organizations yet"
			/>
		</Container>
	);
}
