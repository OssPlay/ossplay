"use client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrgMembership } from "@/types/instance";
import { OrgMembershipRow } from "./org-membership-row";

export function OrganizationsCard({
	userId,
	organizations,
	onChange,
}: {
	userId: string;
	organizations: OrgMembership[];
	onChange: () => void;
}) {
	if (organizations.length === 0) {
		return <p className="text-sm text-muted-foreground">Not a member of any organization.</p>;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Organization</TableHead>
					<TableHead>Role</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{organizations.map((org) => (
					<OrgMembershipRow key={org.id} userId={userId} org={org} onChange={onChange} />
				))}
			</TableBody>
		</Table>
	);
}
