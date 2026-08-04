import { type User, auditLogs, getDb } from "@ossplay/db";
import type { Context } from "hono";
import type { AppEnv } from "../../types";
import { getClientIp } from "../auth/request-info";

export interface AuditEntry {
	action: string;
	targetType?: string;
	targetId?: string;
	metadata?: Record<string, unknown>;
	// Overrides the actor derived from `c.get("user")`. Needed on routes with
	// no authenticated caller at all (accepting an invitation, either org- or
	// instance-scoped) — pass the id of the user the event is actually about,
	// or `null` for a truly system-initiated entry. Omit to use the request's
	// authenticated user, the common case.
	actorUserId?: string | null;
}

// Called from route handlers after an audit-worthy action succeeds. Only a
// deliberately short, fixed list of actions calls this (instance settings
// changes, root-initiated user management, SSH key/server CRUD, org
// create/delete, invitation lifecycle) — see MEMORY.md and PRD.md §2.3's
// amended note. This is not a general-purpose event bus, so don't wire it
// into read paths or org-member-level actions.
export async function logAudit(c: Context<AppEnv>, entry: AuditEntry): Promise<void> {
	const requestUser = c.get("user") as User | undefined;
	const actorUserId =
		entry.actorUserId !== undefined ? entry.actorUserId : (requestUser?.id ?? null);
	await getDb()
		.insert(auditLogs)
		.values({
			actorUserId,
			action: entry.action,
			targetType: entry.targetType,
			targetId: entry.targetId,
			metadata: entry.metadata,
			ipAddress: getClientIp(c),
		});
}
