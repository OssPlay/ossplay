import { resolve } from "node:path";
import { decryptSecret } from "../crypto/secret-box";
import { LocalDiskStorage } from "./local-disk-storage";
import { S3Storage } from "./s3-storage";
import type { StorageDriver } from "./types";

// A bare relative default here (e.g. "./.data/drive") resolves against
// whatever the CURRENT PROCESS's cwd happens to be — which differs between
// `apps/api` and `apps/worker` under `bun dev` (turborepo runs each with its
// own package dir as cwd), so `api` would write to apps/api/.data/drive
// while `worker` reads from apps/worker/.data/drive and gets ENOENT on
// every job. Anchoring to this module's own file location (stable
// regardless of which app imports it) instead of cwd is what keeps both
// processes pointed at the same directory without requiring
// OSSPLAY_LOCAL_STORAGE_PATH to be set for local dev to work.
const DEFAULT_LOCAL_STORAGE_ROOT = resolve(import.meta.dir, "../../../../.data/drive");

// Where local-disk-backed projects live — bind-mounted in production (see
// infra/docker-compose.yml's `api`/`worker` volumes) same as ossplay.yaml,
// not a dev-only path.
function localStorageRoot(): string {
	return process.env.OSSPLAY_LOCAL_STORAGE_PATH ?? DEFAULT_LOCAL_STORAGE_ROOT;
}

interface StorageProjectRef {
	orgId: string;
	destinationId: string | null;
	destination: {
		endpoint: string;
		bucket: string;
		region: string;
		accessKeyId: string;
		secretAccessKeyEncrypted: string;
		cloudfrontUrl: string | null;
		visibility: "public" | "private";
	} | null;
}

// Local disk is a real, always-available fallback — not a dev-only escape
// hatch. A project with no destinationId (never assigned one, or its
// destination was later deleted — s3Destinations' FK is onDelete: "set
// null", see project.schema.ts) always resolves to local-disk storage.
// There's deliberately no "storage not configured" error path anymore:
// every project must always have somewhere to actually store files, in
// every environment, whether or not the org has ever configured a real S3
// destination.
export function resolveStorageDriver(project: StorageProjectRef): StorageDriver {
	if (project.destinationId && project.destination) {
		const destination = project.destination;
		return new S3Storage({
			config: {
				endpoint: destination.endpoint,
				bucket: destination.bucket,
				region: destination.region,
				accessKeyId: destination.accessKeyId,
				secretAccessKey: decryptSecret(destination.secretAccessKeyEncrypted),
			},
			cloudfrontUrl: destination.cloudfrontUrl,
			visibility: destination.visibility,
		});
	}

	return new LocalDiskStorage({ root: localStorageRoot(), orgId: project.orgId });
}
