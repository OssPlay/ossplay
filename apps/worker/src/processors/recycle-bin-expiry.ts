import { sweepExpiredTrash } from "@ossplay/core";
import { getDb, projects, s3Destinations } from "@ossplay/db";
import { eq } from "drizzle-orm";

// No per-asset payload (see @ossplay/core's QUEUE_NAMES.recycleBinExpiry
// comment) — every run sweeps every project's trash for anything past the
// 30-day cutoff. Scheduled as a BullMQ repeatable job (see index.ts), not
// per-upload like the other processors.
export async function processRecycleBinExpiry(): Promise<void> {
	const db = getDb();
	const rows = await db
		.select({ project: projects, destination: s3Destinations })
		.from(projects)
		.leftJoin(s3Destinations, eq(projects.destinationId, s3Destinations.id));

	for (const row of rows) {
		const project = { ...row.project, destination: row.destination };
		try {
			const count = await sweepExpiredTrash(db, project, 30);
			if (count > 0) {
				console.log(
					`[recycle-bin-expiry] permanently deleted ${count} item(s) in project ${project.id}`,
				);
			}
		} catch (err) {
			// One project's storage misbehaving (e.g. a since-revoked S3
			// credential) shouldn't stop the sweep from reaching every other
			// project in the same run.
			console.error(`[recycle-bin-expiry] failed for project ${project.id}:`, err);
		}
	}
}
