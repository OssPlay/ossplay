import { decryptSecret, getOrgManagers, notifyUsers, verifyBucketConfig } from "@ossplay/core";
import { getDb, organizations, s3Destinations, systemLogs, users } from "@ossplay/db";
import { isSmtpConfigured, s3DestinationDriftEmail, sendMail } from "@ossplay/mail";
import { eq, inArray } from "drizzle-orm";

// Same shape as recycle-bin-expiry.ts's template: one query for every row,
// per-row try/catch so one destination's failure doesn't stop the sweep.
// Read-only (verifyBucketConfig, not applyBucketConfig) — a scheduled job
// must never silently rewrite a bucket's real-world permissions with no
// human triggering that specific run; only the dashboard's Configure
// button (apps/api's POST .../configure) applies changes.
export async function processS3DestinationConfigCheck(): Promise<void> {
	const db = getDb();
	const rows = await db
		.select({ destination: s3Destinations, org: organizations })
		.from(s3Destinations)
		.innerJoin(organizations, eq(s3Destinations.orgId, organizations.id));

	for (const row of rows) {
		try {
			await checkOne(db, row.destination, row.org);
		} catch (err) {
			console.error(`[s3-destination-config-check] failed for ${row.destination.id}:`, err);
		}
	}
}

async function checkOne(
	db: ReturnType<typeof getDb>,
	destination: typeof s3Destinations.$inferSelect,
	org: typeof organizations.$inferSelect,
): Promise<void> {
	const previousStatus = destination.configStatus;
	const result = await verifyBucketConfig({
		endpoint: destination.endpoint,
		bucket: destination.bucket,
		region: destination.region,
		accessKeyId: destination.accessKeyId,
		secretAccessKey: decryptSecret(destination.secretAccessKeyEncrypted),
		visibility: destination.visibility,
	});

	await db
		.update(s3Destinations)
		.set({
			configStatus: result.configStatus,
			configError: result.configError,
			configCheckedAt: new Date(),
		})
		.where(eq(s3Destinations.id, destination.id));

	const justDrifted =
		(result.configStatus === "drifted" || result.configStatus === "error") &&
		previousStatus !== result.configStatus;
	if (!justDrifted) return;

	await db.insert(systemLogs).values({
		source: "s3-destination-config-check",
		message: `"${destination.label}" configuration ${result.configStatus}: ${result.configError ?? "unknown reason"}`,
		metadata: { destinationId: destination.id, orgId: org.id },
	});

	const recipients = await getOrgManagers(org.id);
	await notifyUsers(recipients, {
		type: "organization.destination_drifted",
		title: `"${destination.label}" configuration ${result.configStatus}`,
		href: "/organization/destinations",
		metadata: { orgId: org.id, destinationId: destination.id },
	});

	if (!(await isSmtpConfigured()) || recipients.length === 0) return;
	const message = await s3DestinationDriftEmail({
		label: destination.label,
		orgName: org.name,
		reason: result.configError ?? "The bucket's real-world permissions no longer match its visibility.",
		destinationsUrl: "/organization/destinations",
	});
	const recipientRows = await db
		.select({ email: users.email })
		.from(users)
		.where(inArray(users.id, recipients));
	for (const { email } of recipientRows) {
		await sendMail(email, message).catch((err) => {
			console.error(`[s3-destination-config-check] failed to email ${email}:`, err);
		});
	}
}
