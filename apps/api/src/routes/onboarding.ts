import { getDb, organizationMembers } from "@ossplay/db";
import { isSmtpConfigured } from "@ossplay/mail";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { readInstanceConfig } from "../lib/config/instance-config";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const onboardingRoute = new Hono<AppEnv>();

// "Needs onboarding" is derived, not stored: root has zero org memberships.
// There's no persisted "skipped" state for dns/smtp — skipping is a pure
// client-side navigation action, and a step's "completed" flag is just
// whether its underlying data is set, so re-visiting a skipped step later
// (from /settings/instance) naturally shows it as complete once filled in.
onboardingRoute.get(
	"/status",
	requireAuth,
	requireInstancePermission("instance:manage_orgs"),
	async (c) => {
		const user = c.get("user");
		const db = getDb();

		const [membership] = await db
			.select({ orgId: organizationMembers.orgId })
			.from(organizationMembers)
			.where(eq(organizationMembers.userId, user.id))
			.limit(1);
		const orgCompleted = Boolean(membership);

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
