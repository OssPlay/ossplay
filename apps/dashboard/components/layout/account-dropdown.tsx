"use client";

import { BookOpenIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
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
import packageJson from "../../package.json";
import { useAuth } from "../providers/auth-provider";

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;

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
	const { user, handleLogout, isLoading } = useAuth();

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

	return (
		<SidebarFooter>
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
							{DOCS_URL && (
								<DropdownMenuItem render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}>
									<BookOpenIcon /> Documentation
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" disabled={isLoading} onClick={handleLogout}>
								<LogOutIcon /> Log out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
			<p className="px-2 pb-1 text-xs text-center text-muted-foreground">
				Version v{packageJson.version}
			</p>
		</SidebarFooter>
	);
}
