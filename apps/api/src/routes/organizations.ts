import { getDb, invitations, organizationMembers, organizations, users } from "@ossplay/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { getPublicUrl } from "../lib/auth/request-info";
import { generateToken, hashToken } from "../lib/auth/tokens";
import { sendMail } from "../lib/mail/send";
import { inviteEmail } from "../lib/mail/templates";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import { requireOrgMembership, requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const organizationsRoute = new Hono<AppEnv>();

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const createOrganizationSchema = z.object({
	name: z.string().trim().min(1).max(200),
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

		await logAudit(c, {
			action: "organization.create",
			targetType: "organization",
			targetId: organization.id,
			metadata: { name: organization.name },
		});

		return c.json({ organization }, 201);
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

		const acceptUrl = `${getPublicUrl(c)}/invite/${token}`;
		try {
			await sendMail(
				email,
				inviteEmail({
					orgName: org.name,
					inviterName: inviter.name,
					acceptUrl,
				}),
			);
		} catch (err) {
			// The invitation record still exists — an admin can share the link
			// manually if SMTP isn't configured. Surface that rather than
			// pretending the email went out.
			return c.json(
				{
					invitation,
					warning: "Invitation created but the email could not be sent",
					error: err instanceof Error ? err.message : String(err),
				},
				201,
			);
		}

		return c.json({ invitation }, 201);
	},
);
