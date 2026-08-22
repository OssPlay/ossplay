import type { AppEvent } from "@ossplay/core";
import { getDb, organizationMembers, projects } from "@ossplay/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { appEventBus, ensureSubscribed } from "../lib/events-bus";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

export const eventsRoute = new Hono<AppEnv>();

const HEARTBEAT_INTERVAL_MS = 25_000;

// Every project a user may see, for filtering the shared event bus down to
// what this one connection is allowed to receive — same root-bypass shape
// require-org-permission.ts's requireOrgMembership already uses. No :orgId
// route param: one connection covers every org/project the user belongs to,
// so switching projects in the dashboard doesn't need a reconnect.
async function accessibleProjectIds(userId: string, isRoot: boolean): Promise<Set<string>> {
	const db = getDb();
	if (isRoot) {
		const rows = await db.select({ id: projects.id }).from(projects);
		return new Set(rows.map((row) => row.id));
	}
	const rows = await db
		.select({ id: projects.id })
		.from(projects)
		.innerJoin(organizationMembers, eq(organizationMembers.orgId, projects.orgId))
		.where(eq(organizationMembers.userId, userId));
	return new Set(rows.map((row) => row.id));
}

// A narrow, one-directional push channel for the 5 asset-status polling
// loops (usePolledAsset, asset-preview.tsx x2, add-audio-track-dialog.tsx,
// drive-view.tsx) plus the notification bell — replaces near-real-time
// status polling with a push, without the per-message auth/RPC layer a
// general-purpose WebSocket migration would need (see the architecture
// review this follows). Auth is checked once at connection-open, same as
// every other route's middleware chain; a session invalidated mid-connection
// won't drop this stream — acceptable for a read-only status channel.
eventsRoute.get("/events", requireAuth, async (c) => {
	const user = c.get("user");
	const projectIds = await accessibleProjectIds(user.id, user.instanceRole === "root");
	ensureSubscribed();

	return streamSSE(c, async (stream) => {
		const onEvent = async (event: AppEvent) => {
			const visible =
				event.type === "asset.status" ? projectIds.has(event.projectId) : event.userId === user.id;
			if (!visible) return;
			await stream.writeSSE({ event: "message", data: JSON.stringify(event) });
		};
		appEventBus.on("event", onEvent);

		const heartbeat = setInterval(() => {
			stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
		}, HEARTBEAT_INTERVAL_MS);

		await new Promise<void>((resolve) => {
			stream.onAbort(() => {
				clearInterval(heartbeat);
				appEventBus.off("event", onEvent);
				resolve();
			});
		});
	});
});
