"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { Building2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { apiFetch, errorMessage } from "@/lib/api";

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

// The one canonical place organizations get created on this instance — a
// root with no org lands here (see (app)/page.tsx's placeholder) rather than
// filling in a duplicate "create org" input somewhere else.
export default function InstanceOrganizationsPage() {
	const router = useRouter();
	const table = useServerTable<OrganizationsResponse, OrganizationRow>({
		endpoint: "/organizations",
		items: (response) => response.organizations,
	});
	const [createOpen, setCreateOpen] = useState(false);

	return (
		<Container
			header={{
				icon: Building2Icon,
				title: "Organizations",
				description: "Every organization on this instance.",
				action: {
					icon: PlusIcon,
					title: "New organization",
					onClick: () => setCreateOpen(true),
				},
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

			<CreateOrgDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={(id) => {
					table.mutate();
					router.push(`/instance/organizations/${id}`);
				}}
			/>
		</Container>
	);
}

function CreateOrgDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (id: string) => void;
}) {
	const [name, setName] = useState("");

	const createOrg = useAction(
		() =>
			apiFetch<{ organization: { id: string; name: string } }>("/organizations", {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		{
			success: (res) => `"${res.organization.name}" created`,
			error: "Could not create organization",
		},
	);

	// Reset on close, not open — the "New organization" button that opens this
	// dialog calls setCreateOpen(true) directly (bypassing this handler
	// entirely), so a reset-on-open branch never actually runs on that path.
	// Every close path (this dialog's own success handler below, Escape,
	// overlay click) does go through handleOpenChange, so resetting there
	// covers all of them. Same bug/fix as InviteUserDialog, AddDestinationDialog,
	// and CreateProjectDialog elsewhere in this codebase.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setName("");
			createOrg.reset();
		}
		onOpenChange(next);
	}

	async function handleCreate() {
		await createOrg
			.trigger()
			.then((res) => {
				handleOpenChange(false);
				onCreated(res.organization.id);
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New organization</DialogTitle>
				</DialogHeader>
				<FormField
					id="newOrgName"
					label="Organization name"
					value={name}
					onChange={setName}
					autoFocus
					disabled={createOrg.isLoading}
				/>
				<FormError
					message={
						createOrg.error ? errorMessage(createOrg.error, "Could not create organization") : null
					}
				/>
				<DialogFooter>
					<LoadingButton
						loading={createOrg.isLoading}
						onClick={handleCreate}
						disabled={!name.trim()}
					>
						Create
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
