import type { MiddlewareHandler } from "hono";
import type { InstancePermission } from "../lib/authz/permissions";
import { can } from "../lib/authz/permissions";
import type { AppEnv } from "../types";

// Must run after requireAuth (needs c.get('user')).
export function requireInstancePermission(
	permission: InstancePermission,
): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const user = c.get("user");
		if (!can(user, permission)) {
			return c.json({ error: "Forbidden" }, 403);
		}
		await next();
	};
}
