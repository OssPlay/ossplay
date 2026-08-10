import { S3Client } from "bun";

/**
 * Thin wrapper around Bun's native S3 client. One client per S3
 * destination, built from an `s3Destinations` row (PRD.md §6) — an org can
 * have several, each bound to exactly one bucket at creation time (Bun's
 * S3Client has no account-level "list all my buckets" call, only
 * ListObjectsV2 within a bucket you already know).
 *
 * Every object-level operation (read/write/delete/presign/list) stays on
 * this native client — no @aws-sdk dependency for any of it. The one
 * exception is `s3-config.ts`'s bucket-policy/Block-Public-Access
 * management: Bun's client has no bucket-configuration API surface at all
 * (only per-object ACLs at write time), which is what pulled in
 * `@aws-sdk/client-s3` — scoped narrowly to just those calls, not used
 * anywhere object-level operations already work fine without it.
 */
export type S3Config = {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
};

export function createS3Client(config: S3Config): S3Client {
	return new S3Client({
		endpoint: config.endpoint,
		bucket: config.bucket,
		region: config.region,
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
	});
}

export function getPresignedUrl(
	client: S3Client,
	key: string,
	options?: { expiresIn?: number; method?: "GET" | "PUT" },
): string {
	return client.presign(key, {
		expiresIn: options?.expiresIn ?? 3600,
		method: options?.method ?? "GET",
	});
}
