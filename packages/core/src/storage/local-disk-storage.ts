import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LocalFileIo, StorageDriver } from "./types";

// The always-available fallback backend (see resolve.ts) — there's no
// signing concept for a local file, so createUploadTarget/createDownloadUrl
// hand back API-relative routes instead of a presigned URL, and writeObject/
// readObject (LocalFileIo) are what those routes actually call to do the
// real I/O. Every other method treats `key` as an opaque relative path
// joined onto `root` — only these two need a real projectId/assetId, passed
// explicitly by the caller rather than parsed back out of the key, since
// the key's shape isn't guaranteed (old flat assets vs. the newer nested
// per-asset-folder convention coexist — see packages/core/src/storage/key.ts).
export interface LocalDiskStorageOptions {
	root: string;
	orgId: string;
}

export class LocalDiskStorage implements StorageDriver, LocalFileIo {
	constructor(private opts: LocalDiskStorageOptions) {}

	private pathFor(key: string): string {
		return join(this.opts.root, key);
	}

	createUploadTarget(key: string, opts: { mimeType: string; projectId?: string; assetId?: string }): string {
		if (!opts.projectId || !opts.assetId) {
			throw new Error(`LocalDiskStorage.createUploadTarget needs projectId+assetId for key ${key}`);
		}
		return `/organizations/${this.opts.orgId}/projects/${opts.projectId}/assets/${opts.assetId}/local-upload`;
	}

	createDownloadUrl(
		key: string,
		opts?: { disposition?: "inline" | "attachment"; projectId?: string; assetId?: string },
	): string {
		if (!opts?.projectId || !opts?.assetId) {
			throw new Error(`LocalDiskStorage.createDownloadUrl needs projectId+assetId for key ${key}`);
		}
		const disposition = opts.disposition ?? "inline";
		return `/organizations/${this.opts.orgId}/projects/${opts.projectId}/assets/${opts.assetId}/content?disposition=${disposition}`;
	}

	async deleteObject(key: string): Promise<void> {
		await rm(this.pathFor(key), { force: true });
	}

	async deletePrefix(prefix: string): Promise<void> {
		await rm(this.pathFor(prefix), { force: true, recursive: true });
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
		if (data instanceof Uint8Array) {
			await writeFile(path, data);
			return;
		}
		// Streamed straight to disk, chunk by chunk — the previous `new
		// Response(data).arrayBuffer()` fully buffered the entire upload into
		// memory before writing a single byte, which risked OOMing the process
		// on a large file (e.g. a multi-GB video). A failed/aborted read
		// removes the partial file rather than leaving a corrupt, wrong-sized
		// object behind under this key.
		const sink = Bun.file(path).writer();
		const reader = data.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				sink.write(value);
			}
			await sink.end();
		} catch (err) {
			try {
				await sink.end();
			} catch {
				// already broken — the rm below is what matters
			}
			await rm(path, { force: true });
			throw err;
		}
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
