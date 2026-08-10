import { type Project, type S3Destination, getDb, projects, s3Destinations } from "@ossplay/db";
import { eq } from "drizzle-orm";

export type ProjectWithDestination = Project & { destination: S3Destination | null };

// Trusted, internal lookup by id alone — no org-ownership check, unlike
// apps/api/src/lib/drive/resolve-project.ts's version (which also confirms
// the project belongs to the caller's :orgId). Used by apps/worker's
// processors, which only ever act on a projectId already validated when
// the job was enqueued — there's no separate actor to authorize against
// here.
export async function getProjectWithDestination(projectId: string): Promise<ProjectWithDestination | null> {
	const [row] = await getDb()
		.select({ project: projects, destination: s3Destinations })
		.from(projects)
		.leftJoin(s3Destinations, eq(projects.destinationId, s3Destinations.id))
		.where(eq(projects.id, projectId));
	if (!row) return null;
	return { ...row.project, destination: row.destination };
}
