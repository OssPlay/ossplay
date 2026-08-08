"use client";

import { FolderIcon, FolderPlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import Container from "@/components/ui/container";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useOrgSectionId } from "@/lib/current-org";
import { formatDatetime } from "@/lib/utils";

type Project = { id: string; name: string; orgId: string; createdAt: string };

// The org's canonical projects list — the sidebar's project-list.tsx is a
// fast quick-switch nav (and its own quick-create), this is the full
// management surface: every project, when it was created, and a link into
// each one's own settings (rename/delete). Same "sidebar for navigation,
// settings page for management" split already used for organizations
// themselves (org-picker.tsx vs instance/organizations).
export default function OrganizationProjectsPage() {
	const { organizations, user } = useAuth();
	const orgId = useOrgSectionId();
	const membershipOrg = organizations.find((o) => o.id === orgId);
	const hasMembership = Boolean(membershipOrg);

	// Only meaningful for root browsing an org outside its own membership
	// (see current-org.ts's `allowAny`) — GET /:orgId/projects doesn't 404
	// for a nonexistent org (root's membership bypass means it resolves
	// fine, just against an empty result set), so without this dedicated
	// existence check a stale sessionStorage org id (e.g. one deleted since
	// it was last visited) would render this list as silently empty instead
	// of surfacing that the org doesn't actually exist anymore.
	const { error: orgError, isLoading: orgLoading } = useSWR<{ organization: { id: string } }>(
		!hasMembership && orgId ? `/organizations/${orgId}` : null,
	);

	const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
		orgId ? `/organizations/${orgId}/projects` : null,
	);
	const [createOpen, setCreateOpen] = useState(false);

	if (!orgId) return null;

	if (!hasMembership && orgError instanceof ApiError && orgError.status === 404) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	// org:create_projects is owner/admin only — see permissions.ts. Root
	// always passes server-side regardless of membership, same as the rest
	// of this section.
	const canCreate = user.instanceRole === "root" || membershipOrg?.role !== "member";
	const projects = data?.projects ?? [];

	return (
		<ApiLoader isLoading={isLoading || orgLoading}>
			<Container
				header={{
					icon: FolderIcon,
					title: "Projects",
					description: "Every project in this organization.",
					action: canCreate
						? { icon: FolderPlusIcon, title: "New project", onClick: () => setCreateOpen(true) }
						: undefined,
				}}
				size="lg"
			>
				{projects.length === 0 ? (
					<p className="text-sm text-muted-foreground">No projects yet.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Created</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{projects.map((project) => (
								<TableRow key={project.id}>
									<TableCell className="font-medium">{project.name}</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDatetime(project.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										<Link
											href={`/project/${project.id}/settings`}
											className={buttonVariants({ variant: "secondary", size: "sm" })}
										>
											Manage
										</Link>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Container>

			<CreateProjectDialog
				orgId={orgId}
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => mutate()}
			/>
		</ApiLoader>
	);
}

function CreateProjectDialog({
	orgId,
	open,
	onOpenChange,
	onCreated,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [name, setName] = useState("");

	const createProject = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${orgId}/projects`, {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		{ success: (res) => `"${res.project.name}" created`, error: "Could not create project" },
	);

	function handleOpenChange(next: boolean) {
		if (next) {
			setName("");
			createProject.reset();
		}
		onOpenChange(next);
	}

	async function handleCreate() {
		await createProject
			.trigger()
			.then(() => {
				onOpenChange(false);
				onCreated();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
				</DialogHeader>
				<FormField
					id="newProjectName"
					label="Name"
					value={name}
					onChange={setName}
					autoFocus
					disabled={createProject.isLoading}
				/>
				<FormError
					message={
						createProject.error
							? errorMessage(createProject.error, "Could not create project")
							: null
					}
				/>
				<DialogFooter>
					<LoadingButton
						loading={createProject.isLoading}
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
