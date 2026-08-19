import { getDb, projectApiKeys } from "@ossplay/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { hashToken } from "../lib/auth/tokens";
import type { AppEnv } from "../types";

// Checked in this precedence order — headers first since query strings leak
// into logs/referrers/browser history: X-Api-Key header, then
// Authorization: Bearer, then ?api_key=/?access_key= (both accepted, no
// reason to force one spelling on a caller).
function extractPresentedKey(c: Context): string | null {
	const header = c.req.header("X-Api-Key");
	if (header) return header;
	const auth = c.req.header("Authorization");
	if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
	return c.req.query("api_key") ?? c.req.query("access_key") ?? null;
}

// The actual check, factored out of the middleware below so routes that are
// only CONDITIONALLY key-gated (a public project's reads need no key, a
// private project's do — see v1.ts) can call it directly instead of always
// running it via app.use(). Returns whether `c` presented a valid key for
// `projectId` — sets c.set("apiKeyProjectId", ...) as a side effect on
// success, same as the unconditional middleware does.
export async function verifyProjectApiKey(c: Context<AppEnv>, projectId: string): Promise<boolean> {
	const presented = extractPresentedKey(c);
	if (!presented) return false;

	const hash = await hashToken(presented);
	const [key] = await getDb()
		.select()
		.from(projectApiKeys)
		.where(
			and(
				eq(projectApiKeys.id, hash),
				eq(projectApiKeys.projectId, projectId),
				isNull(projectApiKeys.revokedAt),
			),
		);
	if (!key) return false;

	// Best-effort — a slow/failed write here must never block or fail the
	// actual request this key is authorizing.
	getDb()
		.update(projectApiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(projectApiKeys.id, key.id))
		.catch(() => {});

	c.set("apiKeyProjectId", projectId);
	return true;
}

// Public /v1 auth for routes that ALWAYS require a key regardless of
// project visibility (uploads, deletes — any mutation). Reads :project from
// the route (the project's own id/slug).
export const requireApiKey: MiddlewareHandler<AppEnv> = async (c, next) => {
	const projectId = c.req.param("project");
	if (!projectId) return c.json({ error: "Missing project" }, 400);

	const ok = await verifyProjectApiKey(c, projectId);
	if (!ok) return c.json({ error: "Missing or invalid API key" }, 401);
	await next();
};
