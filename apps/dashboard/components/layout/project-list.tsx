"use client";

import { FolderIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { useCurrentOrgId } from "@/lib/current-org";
import { useAuth } from "../providers/auth-provider";

type Project = { id: string; name: string; orgId: string };

// Projects are real URL-based routes now (/project/{id}/settings), not a
// sessionStorage-backed dropdown switcher — clicking one navigates there
// directly, so browser back/forward and bookmarks all work. The org itself
// stays sessionStorage-scoped (see OrgPicker) — this list just reflects
// whichever org is currently active.
export function ProjectList() {
	const { organizations, mutate } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const org = organizations.find((o) => o.id === orgId);
	const pathname = usePathname();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [name, setName] = useState("");

	const createProject = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${orgId}/projects`, {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		{ success: (data) => `"${data.project.name}" created`, error: "Could not create project" },
	);

	async function handleCreate() {
		await createProject
			.trigger()
			.then(() => {
				setName("");
				setDialogOpen(false);
				mutate();
			})
			.catch(() => {});
	}

	if (!org) return null;

	const projectList = org.projects;
	// Owner/admin only, per org:create_projects — see permissions.ts. No
	// client-side permission engine exists in this app; every check like
	// this is a direct role comparison, matching e.g. app-header.tsx's
	// `user.instanceRole === "root"`.
	const canCreate = org.role !== "member";

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Projects</SidebarGroupLabel>
			{canCreate && (
				<Tippy content="Create project">
					<SidebarGroupAction onClick={() => setDialogOpen(true)}>
						<PlusIcon />
					</SidebarGroupAction>
				</Tippy>
			)}
			<SidebarMenu>
				{projectList.length === 0 && (
					<p className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet.</p>
				)}
				{projectList.map((project) => {
					const href = `/project/${project.id}/settings`;
					return (
						<SidebarMenuItem key={project.id}>
							<SidebarMenuButton
								isActive={pathname === href || pathname.startsWith(`${href}/`)}
								render={<Link href={href} />}
							>
								<FolderIcon />
								<span>{project.name}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					);
				})}
			</SidebarMenu>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create project</DialogTitle>
					</DialogHeader>
					<FormField
						id="projectName"
						label="Name"
						value={name}
						onChange={setName}
						disabled={createProject.isLoading}
						autoFocus
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
		</SidebarGroup>
	);
}
