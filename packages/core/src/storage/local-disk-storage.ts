import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LocalFileIo, StorageDriver } from "./types";

// The always-available fallback backend (see resolve.ts) — there's no
// signing concept for a local file, so createUploadTarget/createDownloadUrl
// hand back API-relative routes instead of a presigned URL, and writeObject/
// readObject (LocalFileIo) are what those routes actually call to do the
// real I/O. Flat convention matching S3's: `<root>/<projectId>/<assetId>.<ext>`.
export interface LocalDiskStorageOptions {
	root: string;
	orgId: string;
}

// A key is always `<projectId>/<assetId><ext>` (packages/core/src/storage/
// key.ts's buildAssetKey) — assetId is a uuid, so splitting on the first
// "." safely separates it from the extension.
function parseAssetKey(key: string): { projectId: string; assetId: string } {
	const [projectId, rest] = key.split("/", 2);
	const assetId = rest?.split(".")[0];
	if (!projectId || !assetId) {
		throw new Error(`Malformed asset key for local-disk storage: ${key}`);
	}
	return { projectId, assetId };
}

export class LocalDiskStorage implements StorageDriver, LocalFileIo {
	constructor(private opts: LocalDiskStorageOptions) {}

	private pathFor(key: string): string {
		return join(this.opts.root, key);
	}

	createUploadTarget(key: string): string {
		const { projectId, assetId } = parseAssetKey(key);
		return `/organizations/${this.opts.orgId}/projects/${projectId}/assets/${assetId}/local-upload`;
	}

	createDownloadUrl(key: string, opts?: { disposition?: "inline" | "attachment" }): string {
		const { projectId, assetId } = parseAssetKey(key);
		const disposition = opts?.disposition ?? "inline";
		return `/organizations/${this.opts.orgId}/projects/${projectId}/assets/${assetId}/content?disposition=${disposition}`;
	}

	async deleteObject(key: string): Promise<void> {
		await rm(this.pathFor(key), { force: true });
	}

	async statObject(key: string): Promise<{ size: number } | null> {
		try {
			const info = await stat(this.pathFor(key));
			return { size: info.size };
		} catch {
			return null;
		}
	}

	async writeObject(key: string, data: ReadableStream | Uint8Array): Promise<void> {
		const path = this.pathFor(key);
		await mkdir(dirname(path), { recursive: true });
		const bytes = data instanceof Uint8Array ? data : new Uint8Array(await new Response(data).arrayBuffer());
		await writeFile(path, bytes);
	}

	async readObject(key: string, range?: { start: number; end: number }): Promise<ReadableStream | null> {
		const path = this.pathFor(key);
		if (range) {
			// Bun.file's slice is lazy (no whole-file read) — the right tool for
			// a byte-range request, unlike readFile below which always loads the
			// full file into memory.
			const file = Bun.file(path);
			if (!(await file.exists())) return null;
			return file.slice(range.start, range.end + 1).stream();
		}
		try {
			const bytes = await readFile(path);
			return new Response(bytes).body;
		} catch {
			return null;
		}
	}

	// Byte-array variants for apps/worker's processors (see StorageDriver's
	// own comment) — same underlying fs calls as writeObject/readObject,
	// just a plain Uint8Array in and out instead of a stream, since a
	// processor already has the whole file in memory either way (handed to
	// Sharp/FFmpeg as a buffer, not streamed).
	async downloadObject(key: string): Promise<Uint8Array> {
		return new Uint8Array(await readFile(this.pathFor(key)));
	}

	async uploadObject(key: string, data: Uint8Array): Promise<void> {
		const path = this.pathFor(key);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data);
	}
}
