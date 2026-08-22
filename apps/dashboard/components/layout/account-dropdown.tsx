"use client";

import { BellIcon, BookOpenIcon, LogOutIcon, RssIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarFooter,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import { openUpdateDialog } from "@/lib/update-dialog-store";
import { useAuth } from "../providers/auth-provider";
import { Button } from "../ui/button";

function initials(name: string): string {
	return (
		name
			.trim()
			.split(/\s+/)
			.map((part) => part[0])
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

export function AccountDropdown() {
	const { user, handleLogout, isLoading, instance } = useAuth();

	// Server-side only, on purpose: hits POST /notifications/test, which
	// writes a real row and publishes the same SSE "notification" event any
	// real notify-worthy action would — the bell's unread count and list
	// pick it up purely through that push, not a client-side increment, so
	// this doubles as a manual end-to-end check of the whole pipeline.
	const triggerTestNotification = useAction(
		() => apiFetch("/notifications/test", { method: "POST" }),
		{ error: "Could not send test notification" },
	);

	function UserItem() {
		return (
			<>
				<Avatar className="size-8">
					<AvatarFallback className="overflow-hidden rounded-full">
						{initials(user.name)}
					</AvatarFallback>
				</Avatar>
				<div className="flex flex-1 flex-col gap-0.5 overflow-hidden leading-none">
					<span className="font-medium truncate">{user.name}</span>
					<span className="text-xs truncate text-muted-foreground">{user.email}</span>
				</div>
			</>
		);
	}

	// Same signal UpdateRecallGuard already reads from the shared /instance
	// session-level check (see auth-provider.tsx) — no extra request. Root-
	// only: applying an update is a root-only action (instance:manage_settings
	// on the backend), showing this to anyone else would just be a dead end.
	const canUpdate = user.instanceRole === "root" && instance?.updates.available;

	return (
		<SidebarFooter>
			{canUpdate && (
				<Button
					variant="outline"
					size="xs"
					onClick={() => openUpdateDialog()}
					className="hover:bg-primary/10"
				>
					<RssIcon /> Update available v{instance?.updates.latestVersion}
				</Button>
			)}
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="rounded-2xl" />}>
							<UserItem />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" side="top">
							<DropdownMenuGroup>
								<DropdownMenuLabel className="flex gap-2">
									<UserItem />
								</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuItem render={<Link href="/settings/profile" />}>
								<UserIcon /> Profile
							</DropdownMenuItem>
							<DropdownMenuItem render={<Link href="/settings/security" />}>
								<SettingsIcon /> Settings
							</DropdownMenuItem>
							{instance?.docsUrl && (
								<DropdownMenuItem
									render={<Link href={instance.docsUrl} target="_blank" rel="noreferrer" />}
								>
									<BookOpenIcon /> Documentation
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								disabled={triggerTestNotification.isLoading}
								onClick={() => triggerTestNotification.trigger().catch(() => {})}
							>
								<BellIcon /> Send test notification
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" disabled={isLoading} onClick={handleLogout}>
								<LogOutIcon /> Log out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
			<p className="px-2 pb-1 text-xs text-center text-muted-foreground">
				Version {instance?.version}
			</p>
		</SidebarFooter>
	);
}
