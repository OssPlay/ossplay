"use client";

import { Building2Icon, ChevronsUpDownIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
	const router = useRouter();
	const pathname = usePathname();

	if (!org) return null;

	// A /project/[projectId]/... route is pinned to whichever org owns that
	// project — project/[projectId]/settings/layout.tsx resolves the owning
	// org from the URL and force-corrects `currentOrgId` back to it on every
	// render, which otherwise fights this picker (org appears to "switch"
	// then immediately snaps back). Route away to the dashboard first so
	// there's nothing left to fight the switch.
	function handleSelect(newOrgId: string) {
		setCurrentOrgId(newOrgId);
		if (pathname.startsWith("/project/")) router.push("/");
	}

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
									<DropdownMenuItem key={o.id} onClick={() => handleSelect(o.id)}>
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
