import { getDb, type ProjectApiKey, projectApiKeys } from "@ossplay/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generateToken, hashToken } from "../lib/auth/tokens";
import { getProjectWithDestination } from "../lib/drive/resolve-project";
import { requireAuth } from "../middleware/require-auth";
import { requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const projectApiKeysRoute = new Hono<AppEnv>();

// org:delete_projects (owner/admin only) — a project API key grants full
// read/write on that project's files, the same sensitivity tier as deleting
// the project outright, not the broader org:manage_projects members also
// have. See permissions.ts.
const gate = [requireAuth, requireOrgPermission("org:delete_projects")] as const;

const KEY_PREFIX = "op_";
// Shown in the dashboard after a key's secret is no longer retrievable, so
// a human can tell keys apart ("op_a1b2c3d4...") without the full secret.
const PREFIX_DISPLAY_LENGTH = 10;

function serialize(key: ProjectApiKey) {
	return {
		id: key.id,
		label: key.label,
		keyPrefix: key.keyPrefix,
		lastUsedAt: key.lastUsedAt,
		revokedAt: key.revokedAt,
		createdAt: key.createdAt,
	};
}

projectApiKeysRoute.get("/:orgId/projects/:projectId/api-keys", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await getProjectWithDestination(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const keys = await getDb()
		.select()
		.from(projectApiKeys)
		.where(eq(projectApiKeys.projectId, projectId))
		.orderBy(desc(projectApiKeys.createdAt));

	return c.json({ keys: keys.map(serialize) });
});

const createSchema = z.object({ label: z.string().trim().min(1).max(200) });

projectApiKeysRoute.post("/:orgId/projects/:projectId/api-keys", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await getProjectWithDestination(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	// Same opaque-bearer-token convention as sessions/reset tokens
	// (lib/auth/tokens.ts) — only the hash is ever persisted (it's the row's
	// own primary key, same as sessions.id).
	const secret = `${KEY_PREFIX}${generateToken()}`;
	const id = await hashToken(secret);
	const actor = c.get("user");

	const [key] = await getDb()
		.insert(projectApiKeys)
		.values({
			id,
			projectId,
			label: parsed.data.label,
			keyPrefix: secret.slice(0, PREFIX_DISPLAY_LENGTH),
			createdByUserId: actor.id,
		})
		.returning();
	if (!key) throw new Error("API key insert did not return the expected row");

	// The only response that ever contains the full secret — it can't be
	// retrieved again after this, same one-time-reveal convention as every
	// other generated-credential flow in this app.
	return c.json({ key: serialize(key), secret }, 201);
});

projectApiKeysRoute.delete("/:orgId/projects/:projectId/api-keys/:keyId", ...gate, async (c) => {
	const { orgId, projectId, keyId } = c.req.param();
	const project = await getProjectWithDestination(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const [existing] = await getDb()
		.select()
		.from(projectApiKeys)
		.where(and(eq(projectApiKeys.id, keyId), eq(projectApiKeys.projectId, projectId)));
	if (!existing) return c.json({ error: "API key not found" }, 404);
	if (existing.revokedAt) return c.json({ error: "This key is already revoked" }, 400);

	await getDb()
		.update(projectApiKeys)
		.set({ revokedAt: new Date() })
		.where(eq(projectApiKeys.id, keyId));
	return c.body(null, 204);
});
