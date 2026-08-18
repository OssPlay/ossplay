import { computeDestinations, getDb } from "@ossplay/db";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "./crypto/secret-box";
import { invokeLambdaAsync } from "./lambda";

// Routes a job to an instance-level serverless compute destination instead
// of the BullMQ queue — additive, not a replacement (see
// instance.schema.ts's computeDestinations comment): orgs/projects have no
// say in this, the instance picks automatically. Deliberately doesn't import
// bullmq or apps/api's lib/queue.ts — the caller (apps/api/src/routes/
// assets.ts) still owns the actual getQueue(...).add(...) fallback, this
// function only answers "did a compute destination take this job".
//
// Selection is least-recently-used among enabled+online destinations (nulls
// — never yet used — sort first): every dispatch call rotates to whichever
// destination has gone longest without a job, which is both a fair rotation
// across N destinations and naturally usage-based, without needing a
// separate live-capacity signal from each function.
export async function tryDispatchToComputeDestination(
	queueName: string,
	jobName: string,
	data: unknown,
): Promise<boolean> {
	const db = getDb();
	const [destination] = await db
		.select()
		.from(computeDestinations)
		.where(and(eq(computeDestinations.enabled, true), eq(computeDestinations.status, "online")))
		.orderBy(sql`${computeDestinations.lastUsedAt} asc nulls first`)
		.limit(1);
	if (!destination) return false;

	try {
		await invokeLambdaAsync(
			{
				region: destination.region,
				functionArn: destination.functionArn,
				accessKeyId: destination.accessKeyId,
				secretAccessKey: decryptSecret(destination.secretAccessKeyEncrypted),
			},
			{ queueName, jobName, data },
		);
	} catch {
		// A single failed invoke doesn't flip status away from "online" the way
		// a deliberate /test does (that would need a whole-instance sweep to
		// notice and recover from, same tradeoff s3-destination-config-check.ts
		// avoids by being read-only) — just fall back to BullMQ for this job.
		return false;
	}

	await db
		.update(computeDestinations)
		.set({ lastUsedAt: new Date() })
		.where(eq(computeDestinations.id, destination.id));
	return true;
}
