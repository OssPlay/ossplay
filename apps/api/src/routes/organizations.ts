import {
	getDb,
	invitations,
	organizationMembers,
	organizations,
	projects,
	users,
} from "@ossplay/db";
import { inviteEmail, sendMail } from "@ossplay/mail";
import { and, count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { getPublicUrl } from "../lib/auth/request-info";
import { generateToken, hashToken } from "../lib/auth/tokens";
import { readInstanceConfig, writeInstanceConfig } from "../lib/config/instance-config";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import { requireOrgMembership, requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const organizationsRoute = new Hono<AppEnv>();

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const createOrganizationSchema = z.object({
	name: z.string().trim().min(1).max(200),
});

// Every organization on the instance, not just ones the caller is a member
// of — root has implicit access to all of them (see ARCHITECTURE.md's
// Authorization Model section) but /auth/me's `organizations` field only
// reflects real membership rows, which root often doesn't have one of for
// most orgs. Backs the instance Access Control > Organizations list — same
// list-query (search/page/pageSize) contract as every other root-only
// instance list endpoint, so the FE can use DataTable/useServerTable
// unmodified instead of a one-off table (see DESIGN.md's Dashboard list
// pages section).
organizationsRoute.get(
	"/",
	requireAuth,
	requireInstancePermission("instance:manage_orgs"),
	async (c) => {
		const db = getDb();
		const { where, page, pageSize, limit, offset } = parseListQuery(c, {
			searchable: [organizations.name],
			defaultPageSize: 25,
		});

		const [rows, totalRows] = await Promise.all([
			db
				.select({
					id: organizations.id,
					name: organizations.name,
					createdAt: organizations.createdAt,
				})
				.from(organizations)
				.where(where)
				.orderBy(organizations.name)
				.limit(limit)
				.offset(offset),
			db.select({ total: count() }).from(organizations).where(where),
		]);

		const orgIds = rows.map((row) => row.id);
		const [memberCounts, projectCounts] = orgIds.length
			? await Promise.all([
					db
						.select({ orgId: organizationMembers.orgId, total: count() })
						.from(organizationMembers)
						.where(inArray(organizationMembers.orgId, orgIds))
						.groupBy(organizationMembers.orgId),
					db
						.select({ orgId: projects.orgId, total: count() })
						.from(projects)
						.where(inArray(projects.orgId, orgIds))
						.groupBy(projects.orgId),
				])
			: [[], []];
		const memberCountByOrg = new Map(memberCounts.map((row) => [row.orgId, row.total]));
		const projectCountByOrg = new Map(projectCounts.map((row) => [row.orgId, row.total]));

		return c.json({
			organizations: rows.map((row) => ({
				...row,
				memberCount: memberCountByOrg.get(row.id) ?? 0,
				projectCount: projectCountByOrg.get(row.id) ?? 0,
			})),
			total: totalRows[0]?.total ?? 0,
			page,
			pageSize,
		});
	},
);

// Single-org detail, for the instance Access Control > Organizations detail
// page. requireOrgMembership rather than requireInstancePermission, matching
// GET /:orgId/members and GET /:orgId/projects below — root has implicit
// access, and this stays the one permission model per-org data uses instead
// of a second, instance-scoped one.
organizationsRoute.get("/:orgId", requireAuth, requireOrgMembership, async (c) => {
	const [org] = await getDb()
		.select({ id: organizations.id, name: organizations.name, createdAt: organizations.createdAt })
		.from(organizations)
		.where(eq(organizations.id, c.req.param("orgId")));
	if (!org) return c.json({ error: "Organization not found" }, 404);
	return c.json({ organization: org });
});

// General-purpose org creation, root-only — used by the onboarding "org"
// step and available for root to create further orgs afterward. There is no
// non-root org-creation path: organizations are provisioned by whoever runs
// the instance, not self-served.
organizationsRoute.post(
	"/",
	requireAuth,
	requireInstancePermission("instance:manage_orgs"),
	async (c) => {
		const parsed = createOrganizationSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const user = c.get("user");
		const [organization] = await getDb()
			.insert(organizations)
			.values({ name: parsed.data.name })
			.returning();
		if (!organization) {
			throw new Error("Organization insert did not return the expected row");
		}
		await getDb()
			.insert(organizationMembers)
			.values({ userId: user.id, orgId: organization.id, role: "owner" });

		// Stamped once, the first time any org is ever created — see
		// InstanceConfig.onboardedAt's comment. Not just during onboarding:
		// root creating a further org later (e.g. after deleting the only
		// one) should also permanently clear the "needs onboarding" state if
		// it somehow wasn't set yet.
		if (!readInstanceConfig().onboardedAt) {
			writeInstanceConfig({ onboardedAt: new Date().toISOString() });
		}

		await logAudit(c, {
			action: "organization.create",
			targetType: "organization",
			targetId: organization.id,
			metadata: { name: organization.name },
		});

		return c.json({ organization }, 201);
	},
);

const renameOrganizationSchema = z.object({
	name: z.string().trim().min(1).max(200),
});

// Owner-only (org:manage_settings) — the same "who can touch the org
// itself" boundary as org:delete below; admins can run projects but not
// rename or remove the organization they belong to.
organizationsRoute.put(
	"/:orgId",
	requireAuth,
	requireOrgPermission("org:manage_settings"),
	async (c) => {
		const parsed = renameOrganizationSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const orgId = c.req.param("orgId");
		const [organization] = await getDb()
			.update(organizations)
			.set({ name: parsed.data.name })
			.where(eq(organizations.id, orgId))
			.returning();
		if (!organization) return c.json({ error: "Organization not found" }, 404);

		await logAudit(c, {
			action: "organization.update",
			targetType: "organization",
			targetId: organization.id,
			metadata: { name: organization.name },
		});

		return c.json({ organization });
	},
);

// Cascades at the DB level — organization_members, invitations, projects
// (and projects' assets) all reference orgId/projectId with
// onDelete: "cascade" (see packages/db's organization.schema.ts and
// project.schema.ts), so a single delete here is enough; no manual cleanup
// pass needed.
organizationsRoute.delete(
	"/:orgId",
	requireAuth,
	requireOrgPermission("org:delete"),
	async (c) => {
		const orgId = c.req.param("orgId");
		const db = getDb();
		const [existing] = await db
			.select({ id: organizations.id, name: organizations.name })
			.from(organizations)
			.where(eq(organizations.id, orgId));
		if (!existing) return c.json({ error: "Organization not found" }, 404);

		await db.delete(organizations).where(eq(organizations.id, orgId));

		await logAudit(c, {
			action: "organization.delete",
			targetType: "organization",
			targetId: orgId,
			metadata: { name: existing.name },
		});

		return c.body(null, 204);
	},
);

organizationsRoute.get("/:orgId/members", requireAuth, requireOrgMembership, async (c) => {
	const members = await getDb()
		.select({
			userId: organizationMembers.userId,
			role: organizationMembers.role,
			name: users.name,
			email: users.email,
			lastSignInAt: users.lastSignInAt,
			joinedAt: organizationMembers.createdAt,
		})
		.from(organizationMembers)
		.innerJoin(users, eq(organizationMembers.userId, users.id))
		.where(eq(organizationMembers.orgId, c.req.param("orgId")));

	return c.json({ members });
});

organizationsRoute.get(
	"/:orgId/invitations",
	requireAuth,
	requireOrgPermission("org:manage_members"),
	async (c) => {
		const rows = await getDb()
			.select({
				id: invitations.id,
				email: invitations.email,
				role: invitations.role,
				status: invitations.status,
				expiresAt: invitations.expiresAt,
				acceptedAt: invitations.acceptedAt,
				createdAt: invitations.createdAt,
			})
			.from(invitations)
			.where(eq(invitations.orgId, c.req.param("orgId")));

		return c.json({
			invitations: rows.map((row) => ({
				...row,
				isExpired: row.status === "pending" && row.expiresAt.getTime() < Date.now(),
			})),
		});
	},
);

const createInvitationSchema = z.object({
	email: z.email(),
	role: z.enum(["owner", "admin", "member"]),
});

organizationsRoute.post(
	"/:orgId/invitations",
	requireAuth,
	requireOrgPermission("org:manage_members"),
	async (c) => {
		const orgId = c.req.param("orgId");
		const inviter = c.get("user");
		const parsed = createInvitationSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const db = getDb();
		const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
		if (!org) return c.json({ error: "Organization not found" }, 404);

		const email = parsed.data.email.trim().toLowerCase();

		const [existingPending] = await db
			.select({ id: invitations.id })
			.from(invitations)
			.where(
				and(
					eq(invitations.orgId, orgId),
					eq(invitations.email, email),
					eq(invitations.status, "pending"),
				),
			);
		if (existingPending) {
			return c.json(
				{
					error: "An invitation is already pending for this email",
				},
				409,
			);
		}

		const token = generateToken();
		const tokenHash = await hashToken(token);
		const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);

		const [invitation] = await db
			.insert(invitations)
			.values({
				orgId,
				email,
				role: parsed.data.role,
				invitedByUserId: inviter.id,
				tokenHash,
				expiresAt,
			})
			.returning();
		if (!invitation) throw new Error("Insert did not return the expected row");

		await logAudit(c, {
			action: "user.invited",
			targetType: "invitation",
			targetId: invitation.id,
			metadata: { email, orgId, role: parsed.data.role },
		});

		const acceptUrl = `${getPublicUrl(c)}/invite/${token}`;
		try {
			await sendMail(
				email,
				await inviteEmail({
					orgName: org.name,
					inviterName: inviter.name,
					acceptUrl,
				}),
			);
		} catch (err) {
			// The invitation record still exists — an admin can share the link
			// manually if SMTP isn't configured.
			return c.json(
				{
					invitation,
					inviteUrl: acceptUrl,
					warning: "Invitation created but the email could not be sent",
					error: err instanceof Error ? err.message : String(err),
				},
				201,
			);
		}

		return c.json({ invitation }, 201);
	},
);
