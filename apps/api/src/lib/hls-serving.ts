import {
	LocalDiskStorage,
	type ProjectWithDestination,
	resolveStorageDriver,
	shouldServeStatic,
} from "@ossplay/core";
import type { Asset } from "@ossplay/db";
import type { Context } from "hono";
import { listVariants } from "./variants";

// Shared by the public /v1 HLS routes (v1.ts, API-key/share-token authed)
// and the dashboard's session-authed equivalents (assets.ts) — every
// function here is auth-agnostic (takes an already-resolved Asset/project,
// never touches API keys or share tokens), so the two route sets differ
// only in how they resolve `original` and what `query` they pass (a
// share-token query string for v1; "" for the session-authed routes, which
// are same-origin/cookie-authed and never need it — the query-rewriting
// functions below are already documented no-ops for an empty query).

export const HLS_MIME = "application/vnd.apple.mpegurl";

// A relative-URI HLS playlist, fetched with ?share=xyz, does NOT propagate
// that query string to its own relative sub-requests — a browser/hls.js
// resolving a relative URI against a base URL drops the base's query,
// keeping only the path. Without this, a private video's rung-playlist and
// segment requests would silently lose the share token and 401.
export function appendQueryToUris(text: string, query: string): string {
	if (!query) return text;
	return text
		.split("\n")
		.map((line) => (line && !line.startsWith("#") ? `${line}?${query}` : line))
		.join("\n");
}

// The AUDIO group's EXT-X-MEDIA lines are baked into the stored master
// playlist at packaging time (unlike the subtitle group, injected fresh
// per request below, whose URI already carries the query at construction)
// — their inline URI="..." attribute still needs the caller's token
// appended at serve time, same reasoning as appendQueryToUris above, just
// for a query embedded inside a line instead of the whole next line. The
// `[^"?]` exclusion makes this safe to run unconditionally after subtitle
// injection without double-appending a query that's already there.
export function appendQueryToInlineUris(text: string, query: string): string {
	if (!query) return text;
	return text.replace(/URI="([^"?]+)"/g, `URI="$1?${query}"`);
}

// Injects EXT-X-MEDIA subtitle groups + a SUBTITLES attribute on every
// EXT-X-STREAM-INF line at serve time, not baked into the stored master
// playlist — subtitles can be attached after the HLS package already
// exists, and this keeps them showing up without repackaging video.
export function injectSubtitleGroup(masterText: string, subtitles: Asset[], query: string): string {
	if (subtitles.length === 0) return masterText;
	const mediaLines = subtitles.map((sub) => {
		const label = typeof sub.metadata?.label === "string" ? sub.metadata.label : "Subtitles";
		const language = typeof sub.metadata?.language === "string" ? sub.metadata.language : "en";
		const uri = `subs/${sub.id}.m3u8${query ? `?${query}` : ""}`;
		return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${label}",LANGUAGE="${language}",URI="${uri}",AUTOSELECT=YES`;
	});
	const withGroups = masterText.replace(
		"#EXT-X-VERSION:3\n",
		`#EXT-X-VERSION:3\n${mediaLines.join("\n")}\n`,
	);
	return withGroups.replace(/^#EXT-X-STREAM-INF:(.*)$/gm, `#EXT-X-STREAM-INF:$1,SUBTITLES="subs"`);
}

// Manually-attached audio tracks (apps/api/src/routes/assets.ts's
// audio-tracks routes) are injected the same way subtitles are — at serve
// time, never baked into the stored master playlist — so attaching one
// never requires repackaging video.
//
// The STREAM-INF `AUDIO="audio"` attribute is ALSO added here, not baked
// in at packaging time, even though every rendition packaged after the
// multiAudio-removal change (apps/worker/src/processors/video.ts) is
// always -an: a source with zero audio streams packages zero embedded
// EXT-X-MEDIA lines, and a STREAM-INF line referencing an audio group
// with no members would be a dangling reference — whether the attribute
// belongs depends on whether an audio group actually ends up with any
// members once a request's manually-attached tracks are factored in,
// which can only be known at serve time. Same reasoning subtitles'
// SUBTITLES attribute already follows.
export function injectAudioTrackGroup(masterText: string, tracks: Asset[]): string {
	const mediaLines = tracks.map((track) => {
		const label = typeof track.metadata?.label === "string" ? track.metadata.label : "Audio";
		const language = typeof track.metadata?.language === "string" ? track.metadata.language : "";
		return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${label}",LANGUAGE="${language}",AUTOSELECT=YES,DEFAULT=NO,URI="audio/${track.id}/index.m3u8"`;
	});
	const withGroups =
		mediaLines.length === 0
			? masterText
			: masterText.replace("#EXT-X-VERSION:3\n", `#EXT-X-VERSION:3\n${mediaLines.join("\n")}\n`);
	// True once packaging-time embedded tracks (baked in) or the lines just
	// injected above (manual tracks) put at least one member in the group.
	if (!/^#EXT-X-MEDIA:TYPE=AUDIO,/m.test(withGroups)) return withGroups;
	return withGroups.replace(/^#EXT-X-STREAM-INF:(.*)$/gm, `#EXT-X-STREAM-INF:$1,AUDIO="audio"`);
}

// Finds the ready hls-package variant for an already-resolved original
// asset — callers do their own (auth-appropriate) original-asset lookup
// first, since that lookup differs between the public /v1 routes
// (requireV1Asset) and the session-authed ones (requireAsset).
export async function findReadyHlsPackage(originalAssetId: string): Promise<Asset | null> {
	const variants = await listVariants(originalAssetId);
	return variants.find((v) => v.metadata?.specKey === "hls" && v.status === "ready") ?? null;
}

// Mirrors respondWithAsset's local-disk-stream vs S3-redirect-to-presigned-
// URL split exactly, just against a constructed key instead of an asset
// row's own s3Path (an HLS segment has no `assets` row of its own).
export async function respondWithHlsFile(
	c: Context,
	project: ProjectWithDestination,
	key: string,
	mimeType: string,
): Promise<Response> {
	const storage = resolveStorageDriver(project);
	if (storage instanceof LocalDiskStorage) {
		const stream = await storage.readObject(key);
		if (!stream) return c.json({ error: "File not found in storage" }, 404);
		return new Response(stream, { headers: { "content-type": mimeType } });
	}
	const url = storage.createDownloadUrl(key, { static: shouldServeStatic(project, mimeType) });
	return c.redirect(url, 302);
}
