"use client";

import { BellIcon, MoonIcon, ServerIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, useEffect, useState } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBreadcrumbs } from "@/lib/nav-store";
import { cn } from "@/lib/utils";
import { useAuth } from "../providers/auth-provider";

function AppBreadcrumbs() {
	const breadcrumbs = useBreadcrumbs();
	if (breadcrumbs.length === 0) return null;

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{breadcrumbs.map((crumb, index) => {
					const isLast = index === breadcrumbs.length - 1;
					return (
						<Fragment key={crumb.title}>
							<BreadcrumbItem className={index === 0 ? undefined : "hidden md:block"}>
								{isLast || !crumb.href ? (
									<BreadcrumbPage>{crumb.title}</BreadcrumbPage>
								) : (
									<BreadcrumbLink render={<Link href={crumb.href} target={crumb.target} />}>
										{crumb.title}
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{!isLast && <BreadcrumbSeparator className="hidden md:block" />}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

// No notifications data model exists anywhere in this codebase yet — a real
// shell for a feed to slot into later, not a fabricated one.
function NotificationsButton() {
	return (
		<Popover>
			<PopoverTrigger render={<Button variant="ghost" size="icon" />}>
				<BellIcon className="size-4" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64">
				<p className="text-sm text-muted-foreground">No notifications yet.</p>
			</PopoverContent>
		</Popover>
	);
}

function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	// next-themes doesn't know the real theme until after mount (it reads
	// localStorage/media-query client-side) — resolvedTheme is undefined on
	// the server, so rendering off it directly would mismatch hydration.
	// Same reasoning as the passkey-support check in settings/security.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			{mounted && resolvedTheme === "dark" ? (
				<SunIcon className="size-4" />
			) : (
				<MoonIcon className="size-4" />
			)}
		</Button>
	);
}

export function AppHeader() {
	const { user } = useAuth();
	const isRoot = user.instanceRole === "root";
	const pathname = usePathname();
	const isInstanceSection = pathname === "/instance" || pathname.startsWith("/instance/");

	return (
		<header
			className={cn(
				"sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-zinc-900/5 px-4 backdrop-blur-sm dark:border-white/10",
			)}
		>
			<SidebarTrigger className="-ml-1" />
			<Separator
				orientation="vertical"
				className="mr-2 data-vertical:h-4 data-vertical:self-auto"
			/>
			<AppBreadcrumbs />
			<div className="flex items-center gap-1 ml-auto">
				<NotificationsButton />
				<ThemeToggle />
				{isRoot && (
					<Link
						href="/instance"
						className={buttonVariants({
							variant: isInstanceSection ? "default" : "ghost",
							size: "sm",
						})}
					>
						<ServerIcon className="size-4" />
						Instance settings
					</Link>
				)}
			</div>
		</header>
	);
}
