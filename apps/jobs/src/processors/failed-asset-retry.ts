import { queueForMimeType, tryDispatchToComputeDestination } from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getProcessingQueue, PROCESSING_JOB_OPTS } from "../lib/processing-queue";

// Caps how many times this cron will re-dispatch the same asset — without
// it, a file that's permanently unprocessable (genuinely corrupt, not just
// unlucky timing) would get re-enqueued forever, every tick, indefinitely.
// Counted in metadata.reprocessAttempts (survives across runs since
// markAssetStatus now merges metadata instead of replacing it — see worker/
// processors/shared.ts).
const MAX_REPROCESS_ATTEMPTS = 5;

// Recovers from the class of processing failure BullMQ's own per-job
// attempts/backoff (apps/api's PROCESSING_JOB_OPTS) can't: the environment
// itself was broken for longer than a few seconds of backoff — e.g. a
// missing system binary — so every quick retry failed the same way, and
// only an operator fixing the environment and this cron's next tick
// actually gives the asset a real chance. Scoped to original assets only
// (parentAssetId null); an on-demand variant that failed already gets a
// fresh attempt for free the next time someone requests that same spec
// (assets.ts's POST .../variants checks `cached.status !== "failed"`).
export async function processFailedAssetRetry(): Promise<void> {
	const db = getDb();
	const failed = await db
		.select()
		.from(assets)
		.where(
			and(eq(assets.status, "failed"), isNull(assets.parentAssetId), isNull(assets.deletedAt)),
		);

	for (const asset of failed) {
		const attempts =
			typeof asset.metadata?.reprocessAttempts === "number" ? asset.metadata.reprocessAttempts : 0;
		if (attempts >= MAX_REPROCESS_ATTEMPTS) continue;

		const queueName = queueForMimeType(asset.mimeType);
		if (!queueName) continue; // only ever "failed" via a processing job, so always non-null in practice

		const nextMetadata = { reprocessAttempts: attempts + 1 };
		await db
			.update(assets)
			.set({
				status: "processing",
				metadata: sql`coalesce(${assets.metadata}, '{}'::jsonb) || ${JSON.stringify(nextMetadata)}::jsonb`,
			})
			.where(eq(assets.id, asset.id));

		const jobData = {
			assetId: asset.id,
			projectId: asset.projectId,
			s3Path: asset.s3Path,
			mimeType: asset.mimeType,
		};
		const dispatched = await tryDispatchToComputeDestination(queueName, "process", jobData);
		if (!dispatched) await getProcessingQueue(queueName).add("process", jobData, PROCESSING_JOB_OPTS);
	}
}
