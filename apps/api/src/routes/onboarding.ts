import { getDb, organizations } from "@ossplay/db";
import { isSmtpConfigured } from "@ossplay/mail";
import { Hono } from "hono";
import { readInstanceConfig } from "../lib/config/instance-config";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const onboardingRoute = new Hono<AppEnv>();

// "Needs onboarding" is derived, not stored: the instance itself (not the
// calling user) has zero organizations. Instance-scoped, not user-scoped —
// a root invited via an instance-level invite (instance-users.ts's
// POST /invite) starts with no org memberships of their own, but that
// doesn't mean the instance needs onboarding again if another root already
// walked through it. There's no persisted "skipped" state for dns/smtp —
// skipping is a pure client-side navigation action, and a step's
// "completed" flag is just whether its underlying data is set, so
// re-visiting a skipped step later (from /settings/instance) naturally
// shows it as complete once filled in.
onboardingRoute.get(
	"/status",
	requireAuth,
	requireInstancePermission("instance:manage_orgs"),
	async (c) => {
		const db = getDb();

		const [anyOrg] = await db.select({ id: organizations.id }).from(organizations).limit(1);
		const orgCompleted = Boolean(anyOrg);

		const { domain } = readInstanceConfig();

		return c.json({
			needsOnboarding: !orgCompleted,
			steps: {
				dns: { skippable: true, completed: Boolean(domain.name) },
				smtp: { skippable: true, completed: await isSmtpConfigured() },
				org: { skippable: false, completed: orgCompleted },
			},
		});
	},
);
