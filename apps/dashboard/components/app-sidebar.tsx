"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountDropdown } from "@/components/layout/account-dropdown";
import { OrgPicker } from "@/components/layout/org-picker";
import { ProjectList } from "@/components/layout/project-list";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidepanel } from "@/lib/nav-store";
import type { Sidepanel, SidepanelGroup, SidepanelItem } from "@/lib/nav-types";

function isGroup(entry: SidepanelItem | SidepanelGroup): entry is SidepanelGroup {
	return "items" in entry;
}

function matchesPath(pathname: string, href: string): boolean {
	return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Sidepanels routinely nest a parent path's own page under a more specific
// sibling (e.g. "/instance" alongside "/instance/domain") — a plain prefix
// match would flag both as active on "/instance/domain". Picking the
// longest matching href instead ensures exactly one item lights up.
function findActiveHref(pathname: string, sidepanel: Sidepanel): string | undefined {
	let best: string | undefined;
	for (const entry of sidepanel) {
		const items = isGroup(entry) ? entry.items : [entry];
		for (const item of items) {
			if (matchesPath(pathname, item.href) && (!best || item.href.length > best.length)) {
				best = item.href;
			}
		}
	}
	return best;
}

function SidepanelLink({ item, isActive }: { item: SidepanelItem; isActive: boolean }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={isActive}
				render={<Link href={item.href} target={item.target} />}
			>
				<item.icon />
				<span>{item.title}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

// Consecutive bare SidepanelItems share one labelless SidebarGroup; each
// SidepanelGroup gets its own labeled one — keeps ungrouped entries (e.g.
// "Back to Dashboard") from each getting their own group's worth of padding.
type Chunk =
	| { kind: "items"; items: SidepanelItem[] }
	| {
			kind: "group";
			group: SidepanelGroup;
	  };

function toChunks(sidepanel: Sidepanel): Chunk[] {
	const chunks: Chunk[] = [];
	for (const entry of sidepanel) {
		if (isGroup(entry)) {
			chunks.push({ kind: "group", group: entry });
			continue;
		}
		const last = chunks[chunks.length - 1];
		if (last?.kind === "items") {
			last.items.push(entry);
		} else {
			chunks.push({ kind: "items", items: [entry] });
		}
	}
	return chunks;
}

// The org's project list belongs to the main dashboard (home + browsing a
// project itself, where project-list.tsx's own isActive highlighting is
// meaningful) — not to an instance-wide/org-wide/account management section,
// which has nothing to do with any one project and gets its own dedicated
// sidepanel via <Section> instead. Same pathname-prefix approach app-header.tsx
// already uses for isInstanceSection.
function isManagementSection(pathname: string): boolean {
	return (
		pathname === "/instance" ||
		pathname.startsWith("/instance/") ||
		pathname === "/organization/settings" ||
		pathname.startsWith("/organization/settings/") ||
		pathname === "/settings" ||
		pathname.startsWith("/settings/")
	);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const sidepanel = useSidepanel();
	const pathname = usePathname();
	const activeHref = findActiveHref(pathname, sidepanel ?? []);

	return (
		<Sidebar variant="floating" {...props}>
			<OrgPicker />
			<SidebarContent>
				{!isManagementSection(pathname) && <ProjectList />}
				{toChunks(sidepanel ?? []).map((chunk, index) =>
					chunk.kind === "group" ? (
						<SidebarGroup key={`group-${chunk.group.title}`}>
							<SidebarGroupLabel>
								{chunk.group.icon && <chunk.group.icon className="mr-2" />}
								{chunk.group.title}
							</SidebarGroupLabel>
							<SidebarMenu>
								{chunk.group.items.map((item) => (
									<SidepanelLink key={item.href} item={item} isActive={item.href === activeHref} />
								))}
							</SidebarMenu>
						</SidebarGroup>
					) : (
						// biome-ignore lint/suspicious/noArrayIndexKey: chunks are derived fresh from sidepanel every render, in stable order — there's no identity to key by other than position.
						<SidebarGroup key={`items-${index}`}>
							<SidebarMenu>
								{chunk.items.map((item) => (
									<SidepanelLink key={item.href} item={item} isActive={item.href === activeHref} />
								))}
							</SidebarMenu>
						</SidebarGroup>
					),
				)}
			</SidebarContent>
			<AccountDropdown />
		</Sidebar>
	);
}
