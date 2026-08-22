"use client";

import { BellIcon, MoonIcon, ServerIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, useEffect, useState } from "react";
import useSWR from "swr";
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
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import { useBreadcrumbs } from "@/lib/nav-store";
import { cn, formatDatetime } from "@/lib/utils";
import type { NotificationRow, NotificationsResponse } from "@/types/notifications";
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

// Coarse fallback only — providers/sse-connection.tsx mutate()s this same
// key the moment the server pushes a "notification" event (see notify.ts's
// call sites), so this interval is insurance for a missed/disconnected push,
// not the primary mechanism; "someone joined my org" / "an update is
// available" style events don't need faster than that as a fallback either.
const UNREAD_POLL_INTERVAL_MS = 60_000;

function NotificationsButton() {
	const router = useRouter();
	const { data: unread } = useSWR<{ count: number }>("/notifications/unread-count", {
		refreshInterval: UNREAD_POLL_INTERVAL_MS,
	});
	const { data, mutate } = useSWR<NotificationsResponse>("/notifications?per_page=5");
	const markRead = useAction(
		(id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
		{ error: null },
	);

	async function handleClick(notification: NotificationRow) {
		if (!notification.readAt) {
			await markRead
				.trigger(notification.id)
				.then(() => mutate())
				.catch(() => {});
		}
		if (notification.href) router.push(notification.href);
	}

	const items = data?.notifications ?? [];
	const hasUnread = Boolean(unread?.count);

	return (
		<Popover>
			<Tippy content="Notifications">
				<PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
					<BellIcon className="size-4" />
					{hasUnread && (
						<span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive" />
					)}
				</PopoverTrigger>
			</Tippy>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="px-3 py-2 border-b">
					<p className="text-sm font-medium">Notifications</p>
				</div>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground p-3">No notifications yet.</p>
				) : (
					<div className="flex flex-col max-h-80 overflow-y-auto">
						{items.map((notification) => (
							<button
								key={notification.id}
								type="button"
								onClick={() => handleClick(notification)}
								className={cn(
									"flex flex-col gap-0.5 text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted transition-colors",
									!notification.readAt && "bg-muted/50",
								)}
							>
								<span className="text-sm line-clamp-2">{notification.title}</span>
								<span className="text-xs text-muted-foreground">
									{formatDatetime(notification.createdAt)}
								</span>
							</button>
						))}
					</div>
				)}
				<Link
					href="/notifications"
					className="block px-3 py-2 text-sm text-center text-muted-foreground hover:text-foreground border-t"
				>
					View all notifications
				</Link>
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
		<Tippy
			content={mounted && resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
		>
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
		</Tippy>
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
