import { getDb, notifications, organizationMembers, users } from "@ossplay/db";
import { and, eq, inArray } from "drizzle-orm";
import { readInstanceConfig, writeInstanceConfig } from "../config/instance-config";
import type { UpdateCheckResult } from "../updates/check";

export interface NotifyEntry {
	type: string;
	title: string;
	body?: string;
	href?: string;
	priority?: "low" | "normal" | "high";
	metadata?: Record<string, unknown>;
}

// Called from route handlers (and apps/jobs's background schedules, neither
// of which has a Hono Context) after a notify-worthy event — mirrors
// logAudit/logSystemError's shape: a short, deliberate list of call sites,
// not a general-purpose event bus. One multi-row insert, not N calls to a
// single-recipient version — every current call site already has its full
// recipient list up front.
export async function notifyUsers(userIds: string[], entry: NotifyEntry): Promise<void> {
	if (userIds.length === 0) return;
	await getDb()
		.insert(notifications)
		.values(userIds.map((userId) => ({ userId, priority: entry.priority ?? "normal", ...entry })));
}

// Owners+admins of an org, excluding one user (the actor whose own action
// triggered the notification — they don't need to be told about their own
// change). Shared by every "notify this org's managers" call site
// (invite-accept, project create/delete, s3-destination-config-check)
// rather than repeating the same select 3+ times.
export async function getOrgManagers(orgId: string, excludeUserId?: string): Promise<string[]> {
	const rows = await getDb()
		.select({ userId: organizationMembers.userId })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.orgId, orgId),
				inArray(organizationMembers.role, ["owner", "admin"]),
			),
		);
	return rows.map((r) => r.userId).filter((id) => id !== excludeUserId);
}

// Fires the root "update available" notification at most once per
// newly-observed latestVersion — called from apps/jobs's update-check
// repeatable job and from the manual "Check for updates" route
// (apps/api's instance.overview.ts) so the dedupe logic lives in exactly
// one place instead of being reimplemented at each call site.
export async function notifyRootsOfUpdateIfNew(result: UpdateCheckResult): Promise<void> {
	if (!result.available || !result.latestVersion) return;
	const config = readInstanceConfig();
	if (result.latestVersion === config.updates.lastNotifiedVersion) return;

	const roots = await getDb()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.instanceRole, "root"));
	await notifyUsers(
		roots.map((r) => r.id),
		{
			type: "instance.update_available",
			title: `OSSPlay ${result.latestVersion} is available`,
			href: "/instance",
			priority: result.forced ? "high" : "normal",
			metadata: { version: result.latestVersion, forced: result.forced },
		},
	);
	writeInstanceConfig({ updates: { lastNotifiedVersion: result.latestVersion } });
}
