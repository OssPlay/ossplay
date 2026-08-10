import { extname } from "node:path";

// Flat, deliberately unorganized key convention — the DB (folders/assets
// tables) owns the hierarchy, S3/local-disk just needs a unique, stable
// address per object. `assetId` is the pending row's own id, generated
// before presigning — no separate "file_uuid" lookup.
export function buildAssetKey(projectId: string, assetId: string, originalFilename: string): string {
	return `${projectId}/${assetId}${extname(originalFilename)}`;
}
