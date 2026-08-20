import {
	buildAssetKey,
	computeSpecKey,
	findCachedVariant,
	type ProjectWithDestination,
	queueForMimeType,
	tryDispatchToComputeDestination,
	type VariantSpec,
} from "@ossplay/core";
import { type Asset, assets, getDb } from "@ossplay/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getQueue, PROCESSING_JOB_OPTS } from "./queue";

// Shared by the dashboard's session-authed POST .../variants route
// (assets.ts) and the public /v1 equivalent (v1.ts) — one spec shape,
// validated the same way regardless of caller.
export const variantSpecSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("image-format"),
		format: z.enum(["webp", "avif", "jpeg", "png", "original"]),
		maxDimension: z.union([z.literal(1024), z.literal(2048), z.literal(4096), z.literal("original")]),
	}),
	z.object({
		kind: z.literal("video-transcode"),
		height: z.union([z.literal(480), z.literal(720), z.literal(1080)]),
		format: z.enum(["mp4", "webm"]),
	}),
	z.object({
		kind: z.literal("audio-transcode"),
		bitrate: z.enum(["96k", "128k", "192k", "320k"]),
	}),
]);

// mimeType/filename the placeholder row gets — must match what each worker
// processor's requestedVariant branch actually produces (image.ts/video.ts/
// audio.ts), since finalizeVariant uploads bytes back to this row's
// already-decided s3Path/mimeType rather than the worker deciding either.
function outputForSpec(spec: VariantSpec, originalFilename: string, originalMimeType: string) {
	const base = originalFilename.replace(/\.[^.]+$/, "");
	switch (spec.kind) {
		case "image-format":
			return spec.format === "original"
				? { filename: originalFilename, mimeType: originalMimeType }
				: { filename: `${base}.${spec.format}`, mimeType: `image/${spec.format}` };
		case "video-transcode":
			return {
				filename: `${base}.${spec.format}`,
				mimeType: spec.format === "webm" ? "video/webm" : "video/mp4",
			};
		case "audio-transcode":
			return { filename: `${base}.mp3`, mimeType: "audio/mpeg" };
	}
}

// A variant spec is only meaningful for the mimetype family it targets —
// requesting a video-transcode of an image asset (or vice versa) is a
// client bug, not a 404/500.
export function specMatchesMimeType(spec: VariantSpec, mimeType: string): boolean {
	if (spec.kind === "image-format") return mimeType.startsWith("image/");
	if (spec.kind === "video-transcode") return mimeType.startsWith("video/");
	return mimeType.startsWith("audio/");
}

export type RequestVariantResult =
	| { ok: true; asset: Asset; created: boolean }
	| { ok: false; status: 400; error: string };

// The on-demand conversion flow shared by the dashboard's session-authed
// POST .../variants route and the public /v1 route (an anonymous embed
// viewer or an SDK caller has no session to authenticate with) — check the
// cache first (an identical spec requested twice is an instant hit, no new
// job), else insert a placeholder `assets` row synchronously (so the caller
// gets an id/key back immediately) and enqueue a "variant"-named job for the
// worker's requestedVariant branch to fill in.
export async function requestVariant(
	project: ProjectWithDestination,
	original: Asset,
	spec: VariantSpec,
): Promise<RequestVariantResult> {
	if (!specMatchesMimeType(spec, original.mimeType)) {
		return { ok: false, status: 400, error: "This variant type doesn't apply to this asset's file type" };
	}
	// Same read as the file itself — nothing to generate or cache.
	if (spec.kind === "image-format" && spec.format === "original" && spec.maxDimension === "original") {
		return {
			ok: false,
			status: 400,
			error: "That combination is just the original file — download it directly",
		};
	}

	const specKey = computeSpecKey(spec);
	const db = getDb();
	const cached = await findCachedVariant(db, original.id, specKey);
	if (cached && cached.status !== "failed") {
		return { ok: true, asset: cached, created: false };
	}

	const variantId = crypto.randomUUID();
	const { filename, mimeType } = outputForSpec(spec, original.filename, original.mimeType);
	const key = buildAssetKey(project.id, variantId, filename);
	await db.insert(assets).values({
		id: variantId,
		projectId: project.id,
		folderId: original.folderId,
		filename,
		mimeType,
		s3Path: key,
		parentAssetId: original.id,
		status: "processing",
		metadata: { variant: "on-demand", specKey },
	});

	// Guaranteed non-null: specMatchesMimeType above already ruled out any
	// mimetype (like application/pdf) that queueForMimeType routes to null.
	const queueName = queueForMimeType(original.mimeType);
	if (!queueName) throw new Error(`No processing queue for mimetype ${original.mimeType}`);
	const jobData = {
		assetId: original.id,
		projectId: project.id,
		s3Path: original.s3Path,
		mimeType: original.mimeType,
		requestedVariant: { variantAssetId: variantId, spec },
	};
	const dispatched = await tryDispatchToComputeDestination(queueName, "variant", jobData);
	if (!dispatched) await getQueue(queueName).add("variant", jobData, PROCESSING_JOB_OPTS);

	const [created] = await db.select().from(assets).where(eq(assets.id, variantId));
	if (!created) throw new Error("Variant placeholder insert did not return the expected row");
	return { ok: true, asset: created, created: true };
}

export async function listVariants(assetId: string): Promise<Asset[]> {
	return getDb()
		.select()
		.from(assets)
		.where(eq(assets.parentAssetId, assetId))
		.orderBy(desc(assets.createdAt));
}
