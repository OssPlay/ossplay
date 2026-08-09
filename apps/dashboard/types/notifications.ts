export interface NotificationRow {
	id: string;
	type: string;
	title: string;
	body: string | null;
	href: string | null;
	priority: "low" | "normal" | "high";
	metadata: Record<string, unknown> | null;
	readAt: string | null;
	createdAt: string;
}

export interface NotificationsResponse {
	notifications: NotificationRow[];
	total: number;
	page: number;
	pageSize: number;
}
