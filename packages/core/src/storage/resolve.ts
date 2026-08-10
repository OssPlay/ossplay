import { decryptSecret } from "../crypto/secret-box";
import { LocalDiskStorage } from "./local-disk-storage";
import { S3Storage } from "./s3-storage";
import type { StorageDriver } from "./types";

// Where local-disk-backed projects live — bind-mounted in production (see
// infra/docker-compose.yml's `api`/`worker` volumes) same as ossplay.yaml,
// not a dev-only path. Default only matters for bare `bun dev`.
function localStorageRoot(): string {
	return process.env.OSSPLAY_LOCAL_STORAGE_PATH ?? "./.data/drive";
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
