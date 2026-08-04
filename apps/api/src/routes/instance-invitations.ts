import { getDb, instanceInvitations, users } from "@ossplay/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAudit } from "../lib/audit/log";
import { setSessionCookie } from "../lib/auth/cookie";
import { hashPassword } from "../lib/auth/password";
import { getClientIp, getUserAgent } from "../lib/auth/request-info";
import { completeSignIn } from "../lib/auth/session";
import { hashToken } from "../lib/auth/tokens";
import { readInstanceConfig } from "../lib/config/instance-config";
import type { AppEnv } from "../types";

// Unauthenticated counterpart to instance-users.ts's POST /invite — accepting
// an org-less instance invitation always creates a brand-new account (unlike
// org invitations, there's no "attach an existing user" branch, since the
// invite endpoint already rejects an email that already has an account).
export const instanceInvitationsRoute = new Hono<AppEnv>();

async function findValidInstanceInvitationByToken(token: string) {
	const tokenHash = await hashToken(token);
	const [invitation] = await getDb()
		.select()
		.from(instanceInvitations)
		.where(eq(instanceInvitations.tokenHash, tokenHash));
	if (invitation?.status !== "pending" || invitation.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return invitation;
}

instanceInvitationsRoute.get("/token/:token", async (c) => {
	const invitation = await findValidInstanceInvitationByToken(c.req.param("token"));
	if (!invitation) {
		return c.json({ error: "Invitation not found or no longer valid" }, 404);
	}

	const db = getDb();
	const [inviter] = invitation.invitedByUserId
		? await db.select().from(users).where(eq(users.id, invitation.invitedByUserId))
		: [];
	const config = readInstanceConfig();

	return c.json({
		email: invitation.email,
		grantRoot: invitation.grantRoot,
		inviterName: inviter?.name ?? null,
		instanceName: config.instanceName ?? config.domain.name ?? "OSSPlay",
	});
});

const acceptSchema = z.object({
	name: z.string().trim().min(1).max(200),
	password: z.string().min(12).max(200),
});

instanceInvitationsRoute.post("/token/:token/accept", async (c) => {
	const invitation = await findValidInstanceInvitationByToken(c.req.param("token"));
	if (!invitation) {
		return c.json({ error: "Invitation not found or no longer valid" }, 404);
	}

	const parsed = acceptSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const db = getDb();
	// The invite endpoint already checked this at creation time, but the
	// email could have been claimed since (e.g. two pending invites racing,
	// or a fresh /setup) — re-check right before the insert rather than
	// trust a stale guarantee.
	const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email));
	if (existingUser) {
		return c.json({ error: "An account with this email already exists" }, 409);
	}

	const passwordHash = await hashPassword(parsed.data.password);
	const [createdUser] = await db
		.insert(users)
		.values({
			email: invitation.email,
			passwordHash,
			name: parsed.data.name,
			instanceRole: invitation.grantRoot ? "root" : null,
		})
		.returning();
	if (!createdUser) throw new Error("Insert did not return the expected row");

	await db
		.update(instanceInvitations)
		.set({ status: "accepted", acceptedAt: new Date() })
		.where(eq(instanceInvitations.id, invitation.id));

	await logAudit(c, {
		actorUserId: createdUser.id,
		action: "user.joined",
		targetType: "user",
		targetId: createdUser.id,
		metadata: { via: "instance_invitation", grantRoot: invitation.grantRoot },
	});

	const { token, expiresAt } = await completeSignIn(createdUser.id, {
		ipAddress: getClientIp(c),
		userAgent: getUserAgent(c),
	});
	setSessionCookie(c, token, expiresAt);

	return c.json({ ok: true });
});
