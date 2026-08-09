import { beforeAll, describe, expect, it } from "bun:test";
import { getDb, notifications, users } from "@ossplay/db";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

interface NotificationRow {
	id: string;
	title: string;
	readAt: string | null;
}

describe.skipIf(!process.env.DATABASE_URL)("notifications", () => {
	beforeAll(truncateAllTables);

	let ownerCookie: string;
	let ownerId: string;
	let firstId: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: ownerCookie } = await bootstrapAdmin());
		const meRes = await jsonRequest("/auth/me", { cookie: ownerCookie });
		const meBody = (await meRes.json()) as { user: { id: string } };
		ownerId = meBody.user.id;
	});

	it("GET / and /unread-count start empty", async () => {
		const listRes = await jsonRequest("/notifications", { cookie: ownerCookie });
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as { notifications: NotificationRow[]; total: number };
		expect(listBody.notifications).toHaveLength(0);
		expect(listBody.total).toBe(0);

		const countRes = await jsonRequest("/notifications/unread-count", { cookie: ownerCookie });
		expect(countRes.status).toBe(200);
		const countBody = (await countRes.json()) as { count: number };
		expect(countBody.count).toBe(0);
	});

	it("seeds two notifications directly (no route creates one on its own)", async () => {
		const [first] = await getDb()
			.insert(notifications)
			.values({ userId: ownerId, type: "organization.member_joined", title: "First notification" })
			.returning({ id: notifications.id });
		await getDb()
			.insert(notifications)
			.values({
				userId: ownerId,
				type: "organization.project_created",
				title: "Second notification",
			});
		firstId = first?.id ?? "";
		expect(firstId).toBeTruthy();

		const countRes = await jsonRequest("/notifications/unread-count", { cookie: ownerCookie });
		const countBody = (await countRes.json()) as { count: number };
		expect(countBody.count).toBe(2);

		const listRes = await jsonRequest("/notifications", { cookie: ownerCookie });
		const listBody = (await listRes.json()) as { notifications: NotificationRow[]; total: number };
		expect(listBody.total).toBe(2);
		expect(listBody.notifications.map((n) => n.title).sort()).toEqual([
			"First notification",
			"Second notification",
		]);
	});

	it("PATCH /:id/read marks a single notification read", async () => {
		const res = await jsonRequest(`/notifications/${firstId}/read`, {
			method: "PATCH",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(204);

		const countRes = await jsonRequest("/notifications/unread-count", { cookie: ownerCookie });
		const countBody = (await countRes.json()) as { count: number };
		expect(countBody.count).toBe(1);

		const listRes = await jsonRequest("/notifications", { cookie: ownerCookie });
		const listBody = (await listRes.json()) as { notifications: NotificationRow[] };
		expect(listBody.notifications.find((n) => n.id === firstId)?.readAt).not.toBeNull();
	});

	it("PATCH /:id/read 404s for a notification belonging to someone else", async () => {
		const otherUser = await getDb()
			.insert(users)
			.values({
				name: "Other Person",
				email: "other-person@example.com",
				passwordHash: "not-a-real-hash",
			})
			.returning({ id: users.id });
		const otherUserId = otherUser[0]?.id ?? "";
		const [otherNotification] = await getDb()
			.insert(notifications)
			.values({ userId: otherUserId, type: "instance.update_available", title: "Not yours" })
			.returning({ id: notifications.id });

		const res = await jsonRequest(`/notifications/${otherNotification?.id}/read`, {
			method: "PATCH",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(404);
	});

	it("PATCH /read-all marks every remaining notification read", async () => {
		const res = await jsonRequest("/notifications/read-all", {
			method: "PATCH",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(204);

		const countRes = await jsonRequest("/notifications/unread-count", { cookie: ownerCookie });
		const countBody = (await countRes.json()) as { count: number };
		expect(countBody.count).toBe(0);
	});

	it("is forbidden without a session", async () => {
		const res = await jsonRequest("/notifications");
		expect(res.status).toBe(401);
	});
});
