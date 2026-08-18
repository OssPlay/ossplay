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

		const { domain, onboardedAt } = readInstanceConfig();

		// Once an instance has been onboarded (organizations.ts's POST /
		// stamps this the first time any org is ever created), onboarding
		// never needs to happen again — even if every organization is later
		// deleted, e.g. from the org settings danger zone. Re-deriving this
		// from live org count (as before) would otherwise walk root back
		// through the whole DNS/SMTP/org wizard just because they emptied
		// out the instance, which is a false "first run" signal.
		return c.json({
			needsOnboarding: !onboardedAt,
			steps: {
				dns: { skippable: true, completed: Boolean(domain.name) },
				smtp: { skippable: true, completed: await isSmtpConfigured() },
				// Purely informational (current version + update-check status) —
				// nothing to configure, so always "completed"; it's here so the
				// wizard's step indicator can still show it as a real step.
				updates: { skippable: true, completed: true },
				org: { skippable: false, completed: orgCompleted },
			},
		});
	},
);
