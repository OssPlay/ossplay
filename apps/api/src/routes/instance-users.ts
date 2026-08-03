import { getDb, organizationMembers, organizations, users, webauthnCredentials } from "@ossplay/db";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { clearUserSecondFactors, setUserPassword } from "../lib/auth/admin-reset";
import { hashPassword } from "../lib/auth/password";
import { revokeAllSessionsForUser } from "../lib/auth/session";
import { generateToken } from "../lib/auth/tokens";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceUsersRoute = new Hono<AppEnv>();

// Instance-root-only, not extended to org owners/admins: password/2FA/
// passkeys live on `users`, which has no orgId — there's no existing
// mechanism for an org-scoped admin to reach them regardless of root's own
// (separately implicit) reach into every org. See ARCHITECTURE.md's
// Authorization Model section. This is also the one place identity/
// security actions live at all — org-level membership pages stay scoped to
// role/membership only, never password/2FA/block/delete.
instanceUsersRoute.use("*", requireAuth, requireInstancePermission("instance:manage_users"));

// Orgs where `userId` is the *only* owner — used to block actions (delete,
// demote, remove-from-org) that would otherwise leave an org ownerless.
// Three fixed queries regardless of org count, not N+1 — fine at the scale
// a single self-hosted instance's org list actually reaches.
async function findSoleOwnerOrgs(userId: string): Promise<Array<{ id: string; name: string }>> {
	const db = getDb();
	const ownedMemberships = await db
		.select({ orgId: organizationMembers.orgId })
		.from(organizationMembers)
		.where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "owner")));
	if (ownedMemberships.length === 0) return [];
	const ownedOrgIds = ownedMemberships.map((m) => m.orgId);

	const allOwnersOfThoseOrgs = await db
		.select({ orgId: organizationMembers.orgId })
		.from(organizationMembers)
		.where(
			and(inArray(organizationMembers.orgId, ownedOrgIds), eq(organizationMembers.role, "owner")),
		);
	const ownerCounts = new Map<string, number>();
	for (const { orgId } of allOwnersOfThoseOrgs) {
		ownerCounts.set(orgId, (ownerCounts.get(orgId) ?? 0) + 1);
	}
	const soleOwnerOrgIds = ownedOrgIds.filter((id) => ownerCounts.get(id) === 1);
	if (soleOwnerOrgIds.length === 0) return [];

	return db
		.select({ id: organizations.id, name: organizations.name })
		.from(organizations)
		.where(inArray(organizations.id, soleOwnerOrgIds));
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

instanceUsersRoute.get("/", async (c) => {
	const db = getDb();
	const search = c.req.query("search")?.trim() ?? "";
	const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		Math.max(1, Number.parseInt(c.req.query("pageSize") ?? "", 10) || DEFAULT_PAGE_SIZE),
	);

	const whereClause = search
		? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
		: undefined;

	const [rows, totalRows] = await Promise.all([
		db
			.select({
				id: users.id,
				email: users.email,
				name: users.name,
				instanceRole: users.instanceRole,
				totpEnabled: users.totpEnabled,
				disabledAt: users.disabledAt,
				createdAt: users.createdAt,
				lastSignInAt: users.lastSignInAt,
			})
			.from(users)
			.where(whereClause)
			.orderBy(desc(users.createdAt))
			.limit(pageSize)
			.offset(page * pageSize),
		db.select({ total: count() }).from(users).where(whereClause),
	]);

	const credentials = rows.length
		? await db
				.select({ userId: webauthnCredentials.userId })
				.from(webauthnCredentials)
				.where(
					inArray(
						webauthnCredentials.userId,
						rows.map((row) => row.id),
					),
				)
		: [];
	const passkeyCounts = new Map<string, number>();
	for (const { userId } of credentials) {
		passkeyCounts.set(userId, (passkeyCounts.get(userId) ?? 0) + 1);
	}

	return c.json({
		users: rows.map((row) => ({
			...row,
			passkeyCount: passkeyCounts.get(row.id) ?? 0,
		})),
		total: totalRows[0]?.total ?? 0,
		page,
		pageSize,
	});
});

instanceUsersRoute.get("/:id", async (c) => {
	const target = await getDb().query.users.findFirst({
		where: eq(users.id, c.req.param("id")),
		with: {
			organizationMemberships: {
				columns: { role: true },
				with: { organization: { columns: { id: true, name: true } } },
			},
		},
	});
	if (!target) return c.json({ error: "User not found" }, 404);

	const credentials = await getDb()
		.select({ id: webauthnCredentials.id })
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.userId, target.id));

	return c.json({
		user: {
			id: target.id,
			email: target.email,
			name: target.name,
			instanceRole: target.instanceRole,
			totpEnabled: target.totpEnabled,
			disabledAt: target.disabledAt,
			createdAt: target.createdAt,
			lastSignInAt: target.lastSignInAt,
			passkeyCount: credentials.length,
		},
		organizations: target.organizationMemberships.map((membership) => ({
			id: membership.organization.id,
			name: membership.organization.name,
			role: membership.role,
		})),
	});
});

const setPasswordSchema = z
	.object({
		newPassword: z.string().min(12).max(200).optional(),
		generateTemporary: z.boolean().optional(),
	})
	.refine((data) => Boolean(data.newPassword) !== Boolean(data.generateTemporary), {
		message: "Provide exactly one of newPassword or generateTemporary",
	});

instanceUsersRoute.put("/:id/password", async (c) => {
	const parsed = setPasswordSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json(
			{
				error: "Invalid input",
				details: z.treeifyError(parsed.error),
			},
			400,
		);
	}

	const [target] = await getDb()
		.select()
		.from(users)
		.where(eq(users.id, c.req.param("id")));
	if (!target) return c.json({ error: "User not found" }, 404);

	// Long enough to be unguessable and to satisfy the normal 12-char
	// minimum with room to spare; base64url-safe so it's easy to select/copy
	// in the dashboard's one-time reveal.
	const temporaryPassword = parsed.data.generateTemporary ? generateToken(18) : undefined;
	const newPassword = parsed.data.newPassword ?? temporaryPassword;
	if (!newPassword) {
		throw new Error("Expected a password to have been resolved by now");
	}

	await setUserPassword(target.id, await hashPassword(newPassword));
	await logAudit(c, {
		action: "instance.user.password_reset",
		targetType: "user",
		targetId: target.id,
	});

	return c.json(temporaryPassword ? { temporaryPassword } : {});
});

instanceUsersRoute.post("/:id/reset-2fa", async (c) => {
	const [target] = await getDb()
		.select()
		.from(users)
		.where(eq(users.id, c.req.param("id")));
	if (!target) return c.json({ error: "User not found" }, 404);

	await clearUserSecondFactors(target.id);
	await logAudit(c, {
		action: "instance.user.reset_2fa",
		targetType: "user",
		targetId: target.id,
	});

	return c.body(null, 204);
});

instanceUsersRoute.put("/:id/block", async (c) => {
	const targetId = c.req.param("id");
	const actor = c.get("user");
	if (targetId === actor.id) {
		return c.json({ error: "You cannot block your own account" }, 400);
	}

	const [target] = await getDb().select().from(users).where(eq(users.id, targetId));
	if (!target) return c.json({ error: "User not found" }, 404);

	await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, targetId));
	// Blocking should take effect immediately, not just at the target's next
	// login attempt — kick any session they're currently holding.
	await revokeAllSessionsForUser(targetId);
	await logAudit(c, { action: "instance.user.block", targetType: "user", targetId });

	return c.body(null, 204);
});

instanceUsersRoute.put("/:id/unblock", async (c) => {
	const targetId = c.req.param("id");
	const [target] = await getDb().select().from(users).where(eq(users.id, targetId));
	if (!target) return c.json({ error: "User not found" }, 404);

	await getDb().update(users).set({ disabledAt: null }).where(eq(users.id, targetId));
	await logAudit(c, { action: "instance.user.unblock", targetType: "user", targetId });

	return c.body(null, 204);
});

instanceUsersRoute.delete("/:id", async (c) => {
	const targetId = c.req.param("id");
	const actor = c.get("user");
	if (targetId === actor.id) {
		return c.json({ error: "You cannot delete your own account" }, 400);
	}

	const db = getDb();
	const [target] = await db.select().from(users).where(eq(users.id, targetId));
	if (!target) return c.json({ error: "User not found" }, 404);

	// Root promotion/demotion has no UI anywhere (PRD.md §2.3 keeps that out
	// of scope) — this is the one place a root account could otherwise
	// silently disappear, so it gets its own explicit guard.
	if (target.instanceRole === "root") {
		const roots = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.instanceRole, "root"));
		if (roots.length <= 1) {
			return c.json({ error: "Cannot delete the only instance root" }, 400);
		}
	}

	const soleOwnerOrgs = await findSoleOwnerOrgs(targetId);
	if (soleOwnerOrgs.length > 0) {
		return c.json(
			{
				error: `This user is the sole owner of ${soleOwnerOrgs.map((o) => o.name).join(", ")} — reassign ownership first`,
			},
			409,
		);
	}

	await db.delete(users).where(eq(users.id, targetId));
	await logAudit(c, {
		action: "instance.user.delete",
		targetType: "user",
		targetId,
		metadata: { email: target.email },
	});

	return c.body(null, 204);
});

const orgRoleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

instanceUsersRoute.put("/:id/organizations/:orgId/role", async (c) => {
	const targetId = c.req.param("id");
	const orgId = c.req.param("orgId");
	const parsed = orgRoleSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const db = getDb();
	const [membership] = await db
		.select()
		.from(organizationMembers)
		.where(and(eq(organizationMembers.userId, targetId), eq(organizationMembers.orgId, orgId)));
	if (!membership) return c.json({ error: "Membership not found" }, 404);

	if (membership.role === "owner" && parsed.data.role !== "owner") {
		const soleOwnerOrgs = await findSoleOwnerOrgs(targetId);
		if (soleOwnerOrgs.some((org) => org.id === orgId)) {
			return c.json(
				{
					error: "This user is the sole owner of this organization — promote another member first",
				},
				409,
			);
		}
	}

	await db
		.update(organizationMembers)
		.set({ role: parsed.data.role })
		.where(and(eq(organizationMembers.userId, targetId), eq(organizationMembers.orgId, orgId)));
	await logAudit(c, {
		action: "instance.user.org_role_change",
		targetType: "user",
		targetId,
		metadata: { orgId, role: parsed.data.role },
	});

	return c.body(null, 204);
});

instanceUsersRoute.delete("/:id/organizations/:orgId", async (c) => {
	const targetId = c.req.param("id");
	const orgId = c.req.param("orgId");
	const db = getDb();
	const [membership] = await db
		.select()
		.from(organizationMembers)
		.where(and(eq(organizationMembers.userId, targetId), eq(organizationMembers.orgId, orgId)));
	if (!membership) return c.json({ error: "Membership not found" }, 404);

	if (membership.role === "owner") {
		const soleOwnerOrgs = await findSoleOwnerOrgs(targetId);
		if (soleOwnerOrgs.some((org) => org.id === orgId)) {
			return c.json(
				{
					error: "This user is the sole owner of this organization — promote another member first",
				},
				409,
			);
		}
	}

	await db
		.delete(organizationMembers)
		.where(and(eq(organizationMembers.userId, targetId), eq(organizationMembers.orgId, orgId)));
	await logAudit(c, {
		action: "instance.user.org_remove",
		targetType: "user",
		targetId,
		metadata: { orgId },
	});

	return c.body(null, 204);
});
