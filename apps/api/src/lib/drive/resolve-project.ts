import { getDb, type Project, type S3Destination, projects, s3Destinations } from "@ossplay/db";
import { and, eq } from "drizzle-orm";

export type ProjectWithDestination = Project & { destination: S3Destination | null };

// Every folders/assets route needs this same lookup (confirm the project
// belongs to :orgId, and — for storage-touching routes — the destination
// row to build a StorageDriver from) — extracted since it's the shared
// first step of every route in both folders.ts and assets.ts, not a
// one-off.
export async function getProjectWithDestination(
	orgId: string,
	projectId: string,
): Promise<ProjectWithDestination | null> {
	const [row] = await getDb()
		.select({ project: projects, destination: s3Destinations })
		.from(projects)
		.leftJoin(s3Destinations, eq(projects.destinationId, s3Destinations.id))
		.where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
	if (!row) return null;
	return { ...row.project, destination: row.destination };
}
