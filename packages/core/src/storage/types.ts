// Both backends this feature ships (S3, local-disk) implement this so
// apps/api's upload/download routes and apps/worker's processors don't
// branch on which one they're talking to — see resolve.ts for how a
// project picks one.
export interface StorageDriver {
	// Where a client should PUT the raw bytes. For S3 this is a presigned
	// URL the browser hits directly; for local-disk (no signing concept)
	// it's an API-relative route the dashboard proxies the upload through.
	createUploadTarget(key: string, opts: { mimeType: string }): string;
	// Where a client should GET the bytes for viewing/download. `static`
	// only has an effect on S3Storage (a static/CDN URL instead of a
	// presigned one, and only on a public destination) — LocalDiskStorage
	// ignores it, there's nothing to sign either way. `expiresIn` (seconds)
	// only has an effect on S3Storage's signed-URL branch — LocalDiskStorage
	// has no signing concept, and a static URL doesn't expire either way.
	createDownloadUrl(
		key: string,
		opts?: { disposition?: "inline" | "attachment"; static?: boolean; expiresIn?: number },
	): string;
	deleteObject(key: string): Promise<void>;
	statObject(key: string): Promise<{ size: number } | null>;
	// Direct byte-level access — used by apps/worker's processors, which
	// need the actual original bytes to hand to Sharp/FFmpeg/pdftoppm and
	// need to write the resulting variant's bytes back, not a URL either
	// side of that could fetch through.
	downloadObject(key: string): Promise<Uint8Array>;
	uploadObject(key: string, data: Uint8Array, opts: { mimeType: string }): Promise<void>;
}

// Local-disk only — there's nothing to sign against, so the API-relative
// routes createUploadTarget/createDownloadUrl hand back are actually
// implemented by reading/writing these directly. Optional on the base
// interface since S3Storage never needs them (S3 handles the bytes itself
// once a presigned URL is issued).
export interface LocalFileIo {
	writeObject(key: string, data: ReadableStream | Uint8Array): Promise<void>;
	// `range` (inclusive byte bounds) serves just that slice — needed so a
	// local-disk-backed <video> is actually seekable: without it the browser
	// has no way to re-fetch an arbitrary byte offset and reports the whole
	// resource as unseekable regardless of how much is already buffered.
	readObject(key: string, range?: { start: number; end: number }): Promise<ReadableStream | null>;
}
