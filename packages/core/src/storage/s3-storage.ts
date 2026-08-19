import type { S3Client } from "bun";
import { createS3Client, getPresignedUrl, type S3Config } from "../s3";
import type { StorageDriver } from "./types";

export interface S3StorageOptions {
	config: S3Config;
	cloudfrontUrl: string | null;
	visibility: "public" | "private";
}

// Uploads are always presigned PUT, regardless of visibility — the object
// doesn't exist yet, there's nothing to serve statically. Downloads use a
// static URL only when the caller explicitly asks for one (via `static:
// true` in createDownloadUrl's options) on a public destination; a private
// destination always signs, no matter what the caller asks for. Callers
// decide `static` from the asset's mimeType category against
// project.rules — today only `rules.image.serving` actually distinguishes
// static/signed (PRD's audio/document static-vs-signed rule fields don't
// exist yet in ProjectRules), so every non-image asset defaults to signed
// until that rule surface grows.
export class S3Storage implements StorageDriver {
	private client: S3Client;

	constructor(private opts: S3StorageOptions) {
		this.client = createS3Client(opts.config);
	}

	createUploadTarget(key: string): string {
		return getPresignedUrl(this.client, key, { method: "PUT", expiresIn: 900 });
	}

	createDownloadUrl(
		key: string,
		opts?: { disposition?: "inline" | "attachment"; static?: boolean; expiresIn?: number },
	): string {
		if (opts?.static && this.opts.visibility === "public") {
			const base = this.opts.cloudfrontUrl ?? `${this.opts.config.endpoint}/${this.opts.config.bucket}`;
			return `${base.replace(/\/$/, "")}/${key}`;
		}
		// ResponseContentDisposition isn't in getPresignedUrl's current option
		// shape (packages/core/src/s3.ts) — inline is Bun's/S3's own default
		// for a GET with no override, so "attachment" is the only case that
		// needs anything extra, and this feature doesn't force a browser
		// download today; revisit if/when that's actually needed.
		return getPresignedUrl(this.client, key, { method: "GET", expiresIn: opts?.expiresIn ?? 3600 });
	}

	async deleteObject(key: string): Promise<void> {
		await this.client.delete(key);
	}

	async statObject(key: string): Promise<{ size: number } | null> {
		try {
			const stat = await this.client.stat(key);
			return { size: stat.size };
		} catch {
			return null;
		}
	}

	async downloadObject(key: string): Promise<Uint8Array> {
		const bytes = await this.client.file(key).bytes();
		return bytes;
	}

	async uploadObject(key: string, data: Uint8Array, opts: { mimeType: string }): Promise<void> {
		await this.client.write(key, data, { type: opts.mimeType });
	}
}
