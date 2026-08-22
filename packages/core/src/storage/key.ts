import { extname } from "node:path";

// Nested convention (forward-only) — every file belonging to one root asset
// lives under `${projectId}/${rootAssetId}/...`, with a fixed leaf name per
// artifact kind instead of the original filename (avoids unsafe-filename/
// collision issues, and keeps the DB `filename` column — the mutable
// display name — fully decoupled from the storage key, same as before).
// Assets uploaded before this convention existed keep their old flat
// `${projectId}/${assetId}.${ext}` key untouched (see recycle.ts's
// discriminator) — both shapes coexist indefinitely, no backfill.
function assetFolder(projectId: string, rootAssetId: string): string {
	return `${projectId}/${rootAssetId}`;
}

// Defensive: resolves the true root even if a producer only has a
// derivative's own row in hand. parentAssetId chains are always exactly one
// hop today (nothing ever points at another variant), but nothing enforces
// that structurally — cheap to not assume it here.
export function resolveRootAssetId(asset: { id: string; parentAssetId: string | null }): string {
	return asset.parentAssetId ?? asset.id;
}

export function buildOriginalKey(projectId: string, rootAssetId: string, originalFilename: string): string {
	return `${assetFolder(projectId, rootAssetId)}/original${extname(originalFilename)}`;
}

export function buildThumbnailKey(projectId: string, rootAssetId: string): string {
	// Always webp — every processor (image/video/audio/pdf) hardcodes
	// image/webp for its thumbnail output.
	return `${assetFolder(projectId, rootAssetId)}/thumb.webp`;
}

export function buildScrubKey(projectId: string, rootAssetId: string): string {
	// Always jpg — packageScrubThumbnails' ffmpeg call always writes a .jpg
	// sprite, no format choice exists.
	return `${assetFolder(projectId, rootAssetId)}/scrub.jpg`;
}

export function buildSubtitleKey(projectId: string, rootAssetId: string, language: string): string {
	// Always vtt — both the manual-upload route (srtToVtt) and
	// extractEmbeddedSubtitles always produce WebVTT.
	return `${assetFolder(projectId, rootAssetId)}/subtitles/${language}.vtt`;
}

// An HLS package is many small files (master playlist, per-rendition
// playlists, segments) under one prefix, not a single blob — every file is
// stored/served relative to this prefix.
export function buildHlsPrefix(projectId: string, rootAssetId: string): string {
	return `${assetFolder(projectId, rootAssetId)}/hls`;
}

// Shared by the fixed-enum on-demand system (image-format/video-transcode/
// audio-transcode) and the public /v1 on-the-fly transform once promoted to
// a durable variant — both are keyed by a cache-key string (VariantSpec's
// computeSpecKey / v1.ts's own computeTransformSpecKey) that already
// guarantees no two distinct requested combos collide, so it doubles as a
// collision-free storage leaf name.
export function buildVariantKey(
	projectId: string,
	rootAssetId: string,
	specKey: string,
	outputFilename: string,
): string {
	return `${assetFolder(projectId, rootAssetId)}/variants/${specKey}${extname(outputFilename)}`;
}

// Out-of-band, project-scoped (NOT under any asset's folder) — used only for
// the brief window between a manually-attached-audio-track upload and its
// ffmpeg encode finishing, then deleted immediately after.
export function buildTempUploadKey(projectId: string, tempId: string, originalFilename: string): string {
	return `${projectId}/tmp/${tempId}${extname(originalFilename)}`;
}

// Small, closed mapping — not a general mime-database dependency — covering
// the formats this app's own pipelines actually produce (jobs.ts's
// VariantSpec) plus the handful of common originals users upload. Used by
// the public /v1 on-the-fly transform route (routes/v1.ts) to name an
// output file when the requested format is "original" (no format change,
// so there's no new extension to derive from a VariantSpec-style enum —
// only the source mimeType to fall back to).
const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/avif": "avif",
	"image/gif": "gif",
	"image/svg+xml": "svg",
};

export function mimeToExtension(mimeType: string): string {
	const known = MIME_EXTENSIONS[mimeType];
	if (known) return known;
	const subtype = mimeType.split("/")[1];
	return subtype?.split("+")[0] || "bin";
}
