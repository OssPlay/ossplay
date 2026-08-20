import { extname } from "node:path";

// Flat, deliberately unorganized key convention — the DB (folders/assets
// tables) owns the hierarchy, S3/local-disk just needs a unique, stable
// address per object. `assetId` is the pending row's own id, generated
// before presigning — no separate "file_uuid" lookup.
export function buildAssetKey(projectId: string, assetId: string, originalFilename: string): string {
	return `${projectId}/${assetId}${extname(originalFilename)}`;
}

// An HLS package is many small files (master playlist, per-rendition
// playlists, segments) under one prefix, not a single blob at one key —
// every file is stored/served relative to this prefix instead of a single
// buildAssetKey extension.
export function buildHlsPrefix(projectId: string, assetId: string): string {
	return `${projectId}/${assetId}-hls`;
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
