"use client";

import { FolderIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import {
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tippy } from "@/components/ui/tooltip";
import { useCurrentOrgId } from "@/lib/current-org";
import { useAuth } from "../providers/auth-provider";

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

			{orgId && (
				<CreateProjectDialog
					orgId={orgId}
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					onCreated={() => mutate()}
				/>
			)}
		</SidebarGroup>
	);
}
