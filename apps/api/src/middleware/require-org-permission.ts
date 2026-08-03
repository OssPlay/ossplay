import { getDb, type OrganizationMember, organizationMembers } from "@ossplay/db";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { can, type OrgPermission } from "../lib/authz/permissions";
import type { AppEnv } from "../types";

export async function getMembership(
	userId: string,
	orgId: string,
): Promise<OrganizationMember | null> {
	const [membership] = await getDb()
		.select()
		.from(organizationMembers)
		.where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.orgId, orgId)));
	return membership ?? null;
}

// Must run after requireAuth. Reads :orgId from the route params.
export function requireOrgPermission(permission: OrgPermission): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const orgId = c.req.param("orgId");
		if (!orgId) return c.json({ error: "Missing orgId" }, 400);

		const user = c.get("user");
		const membership = await getMembership(user.id, orgId);
		if (!can(user, permission, membership)) {
			return c.json({ error: "Forbidden" }, 403);
		}
		await next();
	};
}

// Looser than requireOrgPermission: any role (or root) — for read-only
// "who's on this team" visibility rather than a specific management action.
export const requireOrgMembership: MiddlewareHandler<AppEnv> = async (c, next) => {
	const orgId = c.req.param("orgId");
	if (!orgId) return c.json({ error: "Missing orgId" }, 400);

	const user = c.get("user");
	if (user.instanceRole === "root") {
		await next();
		return;
	}
	const membership = await getMembership(user.id, orgId);
	if (!membership) {
		return c.json({ error: "Forbidden" }, 403);
	}
	await next();
};
