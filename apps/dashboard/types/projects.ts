export type Visibility = "public" | "private";

// Mirrors the shape returned by GET /organizations/:orgId/projects and the
// project row returned from the create/rename/destination-change endpoints
// (see apps/api/src/routes/projects.ts) — every dashboard page that lists or
// edits a project works off this one shape rather than a per-page
// redeclaration. A page that only needs a subset (e.g. instance/
// organizations/[id]'s summary counts) should narrow with `Pick<Project, …>`
// rather than hand-roll its own copy.
export interface Project {
	id: string;
	orgId: string;
	name: string;
	visibility: Visibility;
	destinationId: string | null;
	createdAt: string;
}

// An org's S3 destination, in the shape needed to pick one for a project
// (id/label/visibility) — see types/instance.ts's DestinationRow for the
// fuller shape used by the destinations management table itself.
export interface Destination {
	id: string;
	label: string;
	visibility: Visibility;
}
