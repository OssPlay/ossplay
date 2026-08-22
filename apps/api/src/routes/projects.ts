import { getDb, organizations, type ProjectRules, projects, s3Destinations } from "@ossplay/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getOrgManagers, notifyUsersAndPublish } from "../lib/notifications/notify";
import { requireAuth } from "../middleware/require-auth";
import { requireOrgMembership, requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const projectsRoute = new Hono<AppEnv>();

// A project's rules aren't editable yet (no rules-editor UI exists) — this
// is just a valid starting value so the row satisfies the schema's `notNull`
// column, not a considered default for actual asset processing.
const DEFAULT_PROJECT_RULES: ProjectRules = {
	image: { format: "webp", splitTiles: false, serving: "static" },
	video: { resolutions: [], hlsSegmentDuration: 6, drmAes128: false },
};

// True when `err` is (or wraps, via drizzle-orm's DrizzleQueryError) a
// Postgres unique_violation — used to turn a duplicate project id into a
// clean 409 instead of an opaque 500.
function isUniqueViolation(err: unknown): boolean {
	const cause = err instanceof Error && err.cause ? err.cause : err;
	return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "23505");
}

projectsRoute.get("/:orgId/projects", requireAuth, requireOrgMembership, async (c) => {
	const rows = await getDb()
		.select({
			id: projects.id,
			name: projects.name,
			orgId: projects.orgId,
			visibility: projects.visibility,
			destinationId: projects.destinationId,
			createdAt: projects.createdAt,
		})
		.from(projects)
		.where(eq(projects.orgId, c.req.param("orgId")));

	return c.json({ projects: rows });
});

// S3-key-safe: lowercase, digits, hyphens, 2-63 chars — this id organizes
// the project's objects in S3 (see project.schema.ts's column comment).
const PROJECT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(200),
	id: z.string().regex(PROJECT_ID_PATTERN, "Use lowercase letters, numbers, and hyphens only"),
	visibility: z.enum(["public", "private"]),
	// Nullable: a project with no destination falls back to local-disk
	// storage, but only where that's been explicitly enabled (dev/testing,
	// see packages/core/src/storage/resolve.ts) — checked below, not at the
	// schema level, since whether it's allowed is an environment fact, not
	// a shape fact.
	destinationId: z.uuid().nullable(),
});

projectsRoute.post(
	"/:orgId/projects",
	requireAuth,
	requireOrgPermission("org:create_projects"),
	async (c) => {
		const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const actor = c.get("user");
		const db = getDb();
		const orgId = c.req.param("orgId");
		// Unlike rename/delete below, there's no existing project row to
		// select-and-check here — this is the one write in this file that can
		// target a since-deleted org (e.g. a stale page, or a race with
		// another tab's organization delete) with nothing else to catch it
		// first. Without this check the insert still fails, just as an
		// unhandled FK-constraint violation (opaque 500) instead of a clean
		// 404.
		const [org] = await db
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.id, orgId));
		if (!org) return c.json({ error: "Organization not found" }, 404);

		if (parsed.data.destinationId) {
			// Client-side filtering already narrows the destination picker to
			// the chosen visibility, but that's UX only — re-validate here
			// rather than trust it, same as every other cross-entity check in
			// this file.
			const [destination] = await db
				.select({ id: s3Destinations.id, visibility: s3Destinations.visibility })
				.from(s3Destinations)
				.where(
					and(eq(s3Destinations.id, parsed.data.destinationId), eq(s3Destinations.orgId, orgId)),
				);
			if (!destination) return c.json({ error: "S3 destination not found" }, 400);
			if (destination.visibility !== parsed.data.visibility) {
				return c.json(
					{ error: "The chosen S3 destination's visibility doesn't match the project's" },
					400,
				);
			}
		}
		// No destinationId: falls back to local-disk storage (packages/core/
		// src/storage/resolve.ts) — always a valid choice now, not gated on
		// an env flag, so no extra check needed here.

		try {
			const [project] = await db
				.insert(projects)
				.values({
					id: parsed.data.id,
					orgId,
					name: parsed.data.name,
					visibility: parsed.data.visibility,
					destinationId: parsed.data.destinationId,
					rules: DEFAULT_PROJECT_RULES,
				})
				.returning();
			if (!project) throw new Error("Project insert did not return the expected row");

			await notifyUsersAndPublish(await getOrgManagers(orgId, actor.id), {
				type: "organization.project_created",
				title: `Project "${project.name}" was created`,
				href: "/organization/projects",
				metadata: { orgId, projectId: project.id },
			});

			return c.json({ project }, 201);
		} catch (err) {
			if (isUniqueViolation(err)) {
				return c.json({ error: "That project ID is already taken" }, 409);
			}
			throw err;
		}
	},
);

const updateProjectSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	// Nullable, not just optional: null explicitly switches the project
	// back to the local-drive fallback (see project.schema.ts's
	// destinationId comment) — omitting the field entirely leaves the
	// current destination untouched, same distinction the set-below makes.
	destinationId: z.uuid().nullable().optional(),
});

projectsRoute.put(
	"/:orgId/projects/:projectId",
	requireAuth,
	requireOrgPermission("org:manage_projects"),
	async (c) => {
		const parsed = updateProjectSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const db = getDb();
		const orgId = c.req.param("orgId");
		const [existing] = await db
			.select({ id: projects.id, visibility: projects.visibility })
			.from(projects)
			.where(and(eq(projects.id, c.req.param("projectId")), eq(projects.orgId, orgId)));
		if (!existing) return c.json({ error: "Project not found" }, 404);

		if (parsed.data.destinationId) {
			const [destination] = await db
				.select({ id: s3Destinations.id, visibility: s3Destinations.visibility })
				.from(s3Destinations)
				.where(
					and(eq(s3Destinations.id, parsed.data.destinationId), eq(s3Destinations.orgId, orgId)),
				);
			if (!destination) return c.json({ error: "S3 destination not found" }, 400);
			if (destination.visibility !== existing.visibility) {
				return c.json(
					{ error: "The chosen S3 destination's visibility doesn't match the project's" },
					400,
				);
			}
		}

		const [project] = await db
			.update(projects)
			.set({
				...(parsed.data.name !== undefined && { name: parsed.data.name }),
				...(parsed.data.destinationId !== undefined && {
					destinationId: parsed.data.destinationId,
				}),
			})
			.where(eq(projects.id, c.req.param("projectId")))
			.returning();

		return c.json({ project });
	},
);

projectsRoute.delete(
	"/:orgId/projects/:projectId",
	requireAuth,
	requireOrgPermission("org:delete_projects"),
	async (c) => {
		const actor = c.get("user");
		const orgId = c.req.param("orgId");
		const db = getDb();
		const [existing] = await db
			.select({ id: projects.id, name: projects.name })
			.from(projects)
			.where(and(eq(projects.id, c.req.param("projectId")), eq(projects.orgId, orgId)));
		if (!existing) return c.json({ error: "Project not found" }, 404);

		await db.delete(projects).where(eq(projects.id, c.req.param("projectId")));

		await notifyUsersAndPublish(await getOrgManagers(orgId, actor.id), {
			type: "organization.project_deleted",
			title: `Project "${existing.name}" was deleted`,
			href: "/organization/projects",
			metadata: { orgId, projectId: existing.id },
		});

		return c.body(null, 204);
	},
);
