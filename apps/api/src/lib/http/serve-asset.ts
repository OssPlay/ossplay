import type { LocalDiskStorage } from "@ossplay/core";

// Serves a local-disk-backed asset's bytes with HTTP Range support. Without
// this, a browser's <video> reports the resource as unseekable
// (`video.seekable` stays `[[0,0]]`) no matter how much of it is already
// buffered — seeking relies on the browser being able to issue its own
// ranged re-fetches, and a plain 200-with-no-Accept-Ranges response never
// advertises that capability. S3-backed projects get this for free (the
// content route redirects to a presigned URL and S3 handles Range
// natively) — this only matters for the local-disk fallback, shared by the
// dashboard's asset content route and the public /v1 content route.
export async function serveLocalDiskAsset(
	storage: LocalDiskStorage,
	opts: {
		key: string;
		mimeType: string;
		filename: string;
		disposition: "inline" | "attachment";
		rangeHeader: string | null;
	},
): Promise<Response> {
	const info = await storage.statObject(opts.key);
	if (!info) return new Response(JSON.stringify({ error: "File not found in storage" }), { status: 404 });

	const contentDisposition = `${opts.disposition}; filename="${encodeURIComponent(opts.filename)}"`;
	const range = opts.rangeHeader ? parseByteRange(opts.rangeHeader, info.size) : null;

	const stream = await storage.readObject(opts.key, range ?? undefined);
	if (!stream) return new Response(JSON.stringify({ error: "File not found in storage" }), { status: 404 });

	if (!range) {
		return new Response(stream, {
			headers: {
				"content-type": opts.mimeType,
				"content-disposition": contentDisposition,
				"accept-ranges": "bytes",
				"content-length": String(info.size),
			},
		});
	}

	return new Response(stream, {
		status: 206,
		headers: {
			"content-type": opts.mimeType,
			"content-disposition": contentDisposition,
			"accept-ranges": "bytes",
			"content-range": `bytes ${range.start}-${range.end}/${info.size}`,
			"content-length": String(range.end - range.start + 1),
		},
	});
}

// A `<video>` element only ever sends a single `bytes=start-end` range (no
// multi-range requests), so that's the only form handled — anything else
// (or an unsatisfiable range) just falls back to a full 200 response rather
// than a 416, which is a safe default a client can always fall back on.
function parseByteRange(header: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, startStr, endStr] = match;
	let start = startStr ? Number.parseInt(startStr, 10) : Number.NaN;
	let end = endStr ? Number.parseInt(endStr, 10) : Number.NaN;
	if (Number.isNaN(start) && Number.isNaN(end)) return null;
	if (Number.isNaN(start)) {
		// Suffix form: "bytes=-500" means the last 500 bytes.
		start = Math.max(0, size - end);
		end = size - 1;
	} else if (Number.isNaN(end) || end >= size) {
		end = size - 1;
	}
	if (start > end || start >= size) return null;
	return { start, end };
}
