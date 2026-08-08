import { getDb, users } from "@ossplay/db";
import { passwordResetEmail, sendMail } from "@ossplay/mail";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { setSessionCookie } from "../lib/auth/cookie";
import { normalizeEmail } from "../lib/auth/email";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { consumePasswordResetToken, createPasswordResetToken } from "../lib/auth/password-reset";
import { checkRateLimit } from "../lib/auth/rate-limit";
import { getClientIp, getPublicUrl, getUserAgent } from "../lib/auth/request-info";
import { completeSignIn, revokeAllSessionsForUser } from "../lib/auth/session";
import { logSystemError } from "../lib/system-log";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

export const passwordRoute = new Hono<AppEnv>();

const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(12).max(200),
});

// Keeps the caller's own session, revokes every other one — someone who
// just proved they know the current password stays logged in here, but
// anywhere else the account might be compromised gets logged out.
passwordRoute.post("/change-password", requireAuth, async (c) => {
	const user = c.get("user");
	const session = c.get("session");
	const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
		return c.json({ error: "Current password is incorrect" }, 401);
	}

	const passwordHash = await hashPassword(parsed.data.newPassword);
	await getDb().update(users).set({ passwordHash }).where(eq(users.id, user.id));
	await revokeAllSessionsForUser(user.id, session.id);

	return c.body(null, 204);
});

const forgotPasswordSchema = z.object({ email: z.email() });

passwordRoute.post("/forgot-password", async (c) => {
	const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const email = normalizeEmail(parsed.data.email);
	const rateLimit = checkRateLimit(`forgot-password:${email}`);
	if (!rateLimit.allowed) {
		c.header("Retry-After", String(rateLimit.retryAfterSeconds));
		return c.json({ error: "Too many attempts" }, 429);
	}

	const [user] = await getDb().select().from(users).where(eq(users.email, email));

	// Always the same response whether the email exists or not — no user
	// enumeration. Email delivery is best-effort: a misconfigured SMTP server
	// shouldn't turn into a different response either.
	if (user) {
		const { token } = await createPasswordResetToken(user.id);
		const resetUrl = `${getPublicUrl(c)}/reset-password?token=${token}`;
		try {
			await sendMail(user.email, await passwordResetEmail({ resetUrl }));
		} catch (err) {
			// Swallowed deliberately from the caller's perspective — see comment
			// above — but still recorded so root can see why, without turning
			// the response itself into an email-enumeration oracle.
			await logSystemError({
				source: "mail",
				message: err instanceof Error ? err.message : String(err),
				metadata: { context: "forgot_password", to: user.email },
			});
		}
	}

	return c.json({
		message: "If that email exists, a reset link has been sent.",
	});
});

const resetPasswordSchema = z.object({
	token: z.string().min(1),
	newPassword: z.string().min(12).max(200),
});

passwordRoute.post("/reset-password", async (c) => {
	const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const result = await consumePasswordResetToken(parsed.data.token);
	if (!result) {
		return c.json({ error: "Invalid or expired reset link" }, 400);
	}

	const passwordHash = await hashPassword(parsed.data.newPassword);
	await getDb().update(users).set({ passwordHash }).where(eq(users.id, result.userId));
	// No "current session" to preserve — the caller wasn't logged in.
	await revokeAllSessionsForUser(result.userId);

	const { token, expiresAt } = await completeSignIn(result.userId, {
		ipAddress: getClientIp(c),
		userAgent: getUserAgent(c),
	});
	setSessionCookie(c, token, expiresAt);

	return c.json({ ok: true });
});
