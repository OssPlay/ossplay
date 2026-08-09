"use client";

// This page reads search params at runtime (useServerTable) — opt out of
// static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { NotificationRow, NotificationsResponse } from "@/types/notifications";

const PRIORITY_VARIANT: Record<
	NotificationRow["priority"],
	"secondary" | "outline" | "destructive"
> = {
	low: "outline",
	normal: "secondary",
	high: "destructive",
};

const columns: DataTableColumn<NotificationRow>[] = [
	{
		key: "title",
		title: "Notification",
		cell: (row) => (
			<div className="flex flex-col gap-0.5">
				<span className={cn("text-sm", !row.readAt && "font-medium")}>{row.title}</span>
				{row.body && <span className="text-xs text-muted-foreground">{row.body}</span>}
			</div>
		),
	},
	{
		key: "priority",
		title: "Priority",
		cell: (row) => (
			<Badge variant={PRIORITY_VARIANT[row.priority]} className="capitalize">
				{row.priority}
			</Badge>
		),
	},
	{ key: "createdAt", title: "When", formatter: "datetime", className: "text-muted-foreground" },
];

export default function NotificationsPage() {
	const router = useRouter();
	const table = useServerTable<NotificationsResponse, NotificationRow>({
		endpoint: "/notifications",
		items: (response) => response.notifications,
	});

	const markRead = useAction(
		(id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
		{ error: null },
	);
	const markAllRead = useAction(() => apiFetch("/notifications/read-all", { method: "PATCH" }), {
		success: "All notifications marked as read",
		error: "Could not mark notifications as read",
	});

	async function handleRowClick(notification: NotificationRow) {
		if (!notification.readAt) {
			await markRead
				.trigger(notification.id)
				.then(() => table.mutate())
				.catch(() => {});
		}
		if (notification.href) router.push(notification.href);
	}

	async function handleMarkAllRead() {
		await markAllRead
			.trigger()
			.then(() => table.mutate())
			.catch(() => {});
	}

	return (
		<Container
			header={{
				icon: BellIcon,
				title: "Notifications",
				description: "Invites, organization changes, and update announcements.",
				action: {
					icon: CheckCheckIcon,
					title: "Mark all as read",
					onClick: handleMarkAllRead,
				},
			}}
			size="lg"
		>
			<DataTable
				table={table}
				rowId={(row) => row.id}
				columns={columns}
				onRowClick={handleRowClick}
				searchPlaceholder="Search notifications…"
				emptyTitle="No notifications yet"
				facets={[
					{
						key: "priority",
						title: "Priority",
						options: [
							{ label: "Low", value: "low" },
							{ label: "Normal", value: "normal" },
							{ label: "High", value: "high" },
						],
					},
				]}
			/>
		</Container>
	);
}
