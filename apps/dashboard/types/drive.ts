export interface DriveFolder {
	id: string;
	projectId: string;
	parentId: string | null;
	name: string;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface DriveAsset {
	id: string;
	projectId: string;
	folderId: string | null;
	filename: string;
	mimeType: string;
	s3Path: string;
	size: number | null;
	status: "pending" | "processing" | "ready" | "failed";
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
	// The worker-generated thumbnail variant's id, if one exists — only
	// present on the drive-browse response (apps/api/src/routes/folders.ts's
	// attachThumbnails), null on responses that don't attach it (trash,
	// single-asset fetch).
	thumbnailAssetId?: string | null;
	// True while this asset has at least one on-demand variant (adaptive HLS,
	// the seek-bar scrub sprite, an eagerly-triggered compatibility transcode
	// — see apps/api/src/lib/variants.ts's triggerEagerVideoVariants) still
	// short of ready/failed — attached by apps/api/src/routes/folders.ts's
	// attachProcessingVariants, same "only present where it's computed"
	// pattern as thumbnailAssetId above. This is independent of `status`:
	// the row itself can already be "ready" (its own eager thumbnail+probe
	// finished fast) while this stays true until the heavier renditions
	// catch up, so Drive keeps showing it as still processing.
	hasProcessingVariants?: boolean;
	// Only present on a GET .../assets/:assetId/variants row (a variant is
	// itself just an `assets` row with parentAssetId set) — never on a
	// regular original. `metadata.variant` is "thumbnail" for eager
	// thumbnails, "on-demand" for both the fixed-enum "Download as…" system
	// and this session's /v1 promoted transforms, both keyed by
	// `metadata.specKey` (see packages/core/src/jobs.ts's computeSpecKey and
	// apps/api/src/routes/v1.ts's computeTransformSpecKey).
	parentAssetId?: string | null;
	metadata?: { variant?: string; specKey?: string; [key: string]: unknown } | null;
}

export interface DriveBrowseResponse {
	folder: DriveFolder | null;
	breadcrumb: DriveFolder[];
	childFolders: DriveFolder[];
	childAssets: { items: DriveAsset[]; total: number; page: number; pageSize: number };
}

// Mirrors packages/core/src/jobs.ts's VariantSpec — the dashboard talks to
// the API over HTTP, not a monorepo-internal import, same reasoning as
// DriveAsset/DriveFolder being hand-declared mirrors rather than imports
// from @ossplay/db.
export type VariantSpec =
	| {
			kind: "image-format";
			format: "webp" | "avif" | "jpeg" | "png" | "original";
			maxDimension: 1024 | 2048 | 4096 | "original";
	  }
	| { kind: "video-transcode"; height: 480 | 720 | 1080; format: "mp4" | "webm" }
	| { kind: "audio-transcode"; bitrate: "96k" | "128k" | "192k" | "320k" };

export interface DriveActivityEntry {
	id: string;
	action: "uploaded" | "renamed" | "moved" | "trashed" | "restored";
	fromValue: string | null;
	toValue: string | null;
	createdAt: string;
	actorName: string | null;
	actorEmail: string | null;
}
