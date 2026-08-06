import { getDb, type ProjectRules, projects } from "@ossplay/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
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

projectsRoute.get("/:orgId/projects", requireAuth, requireOrgMembership, async (c) => {
	const rows = await getDb()
		.select({
			id: projects.id,
			name: projects.name,
			orgId: projects.orgId,
			createdAt: projects.createdAt,
		})
		.from(projects)
		.where(eq(projects.orgId, c.req.param("orgId")));

	return c.json({ projects: rows });
});

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(200),
});

projectsRoute.post(
	"/:orgId/projects",
	requireAuth,
	requireOrgPermission("org:create_projects"),
	async (c) => {
		const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const [project] = await getDb()
			.insert(projects)
			.values({
				orgId: c.req.param("orgId"),
				name: parsed.data.name,
				rules: DEFAULT_PROJECT_RULES,
			})
			.returning();
		if (!project) throw new Error("Project insert did not return the expected row");

		return c.json({ project }, 201);
	},
);

const renameProjectSchema = z.object({
	name: z.string().trim().min(1).max(200),
});

projectsRoute.put(
	"/:orgId/projects/:projectId",
	requireAuth,
	requireOrgPermission("org:manage_projects"),
	async (c) => {
		const parsed = renameProjectSchema.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

		const db = getDb();
		const [existing] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(eq(projects.id, c.req.param("projectId")), eq(projects.orgId, c.req.param("orgId"))),
			);
		if (!existing) return c.json({ error: "Project not found" }, 404);

		const [project] = await db
			.update(projects)
			.set({ name: parsed.data.name })
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
		const db = getDb();
		const [existing] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(eq(projects.id, c.req.param("projectId")), eq(projects.orgId, c.req.param("orgId"))),
			);
		if (!existing) return c.json({ error: "Project not found" }, 404);

		await db.delete(projects).where(eq(projects.id, c.req.param("projectId")));
		return c.body(null, 204);
	},
);
