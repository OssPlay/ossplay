"use client";

import { Building2Icon, ChevronsUpDownIcon } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { setCurrentOrgId, useCurrentOrgId } from "@/lib/current-org";
import { useAuth } from "../providers/auth-provider";

// Moved here from the header — "current org" itself is still sessionStorage
// only (per-tab, see lib/current-org.ts), just the picker's UI now lives in
// the sidebar next to the project list it drives, instead of the top header.
export function OrgPicker() {
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const org = organizations.find((o) => o.id === orgId);

	if (!org) return null;

	return (
		<SidebarHeader>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
							<div className="flex items-center justify-center rounded-lg aspect-square size-8 bg-sidebar-primary text-sidebar-primary-foreground">
								<Building2Icon className="size-4" />
							</div>
							<div className="flex flex-1 flex-col gap-0.5 overflow-hidden leading-none">
								<span className="font-medium truncate">{org.name}</span>
								<span className="text-xs truncate text-muted-foreground capitalize">
									{org.role}
								</span>
							</div>
							<ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-64">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Organizations</DropdownMenuLabel>
								{organizations.map((o) => (
									<DropdownMenuItem key={o.id} onClick={() => setCurrentOrgId(o.id)}>
										{o.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarHeader>
	);
}
