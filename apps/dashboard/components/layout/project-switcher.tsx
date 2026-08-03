"use client";

import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from "lucide-react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { useCurrentOrgId } from "@/lib/current-org";
import { setCurrentProjectId, useCurrentProjectId } from "@/lib/current-project";
import { useAuth } from "../providers/auth-provider";

type Project = { id: string; name: string; orgId: string };

export function ProjectSwitcher() {
	const { organizations, mutate } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const org = organizations.find((o) => o.id === orgId);

	const projectList = org?.projects ?? [];
	const projectId = useCurrentProjectId(projectList.map((p) => p.id));
	const currentProject = projectList.find((p) => p.id === projectId);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [name, setName] = useState("");

	const createProject = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${orgId}/projects`, {
				method: "POST",
				body: JSON.stringify({ name }),
			}),
		{ error: "Could not create project" },
	);

	async function handleCreate() {
		await createProject
			.trigger()
			.then((res) => {
				setCurrentProjectId(res.project.id);
				setName("");
				setDialogOpen(false);
				mutate();
			})
			.catch(() => {});
	}

	if (!org) return null;

	return (
		<SidebarHeader>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
							<div className="flex items-center justify-center rounded-lg aspect-square size-8 bg-sidebar-primary text-sidebar-primary-foreground">
								<FolderIcon className="size-4" />
							</div>
							<div className="flex flex-1 flex-col gap-0.5 overflow-hidden leading-none">
								<span className="font-medium truncate">{currentProject?.name ?? "No project"}</span>
								<span className="text-xs truncate text-muted-foreground">{org.name}</span>
							</div>
							<ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Projects</DropdownMenuLabel>
								{projectList.length === 0 && (
									<p className="px-3 py-2 text-sm text-muted-foreground">
										No projects yet — create one below.
									</p>
								)}
								{projectList.map((p) => (
									<DropdownMenuItem key={p.id} onClick={() => setCurrentProjectId(p.id)}>
										{p.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setDialogOpen(true)}>
								<PlusIcon /> Create project
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
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
		</SidebarHeader>
	);
}
