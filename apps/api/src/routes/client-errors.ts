import { Hono } from "hono";
import { z } from "zod";
import { logSystemError } from "../lib/system-log";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

export const clientErrorsRoute = new Hono<AppEnv>();

// Any signed-in user's browser can throw — this isn't gated behind any
// instance/org permission, just a session, same as notifications.ts.
clientErrorsRoute.use("*", requireAuth);

const clientErrorSchema = z.object({
	message: z.string().trim().min(1).max(2000),
	stack: z.string().max(8000).optional(),
	path: z.string().max(2000).optional(),
	kind: z.string().max(100).optional(),
});

// Deliberately the most defensive route in the app: this exists to report
// that something already broke client-side, so it must never itself throw
// in a way that could cascade into another uncaught error on the reporting
// client. Always 204, even on a malformed body or a failed insert — the
// caller (the render error boundary / unhandledrejection hook) fires this
// and swallows the result either way.
clientErrorsRoute.post("/", async (c) => {
	try {
		const user = c.get("user");
		const parsed = clientErrorSchema.safeParse(await c.req.json().catch(() => null));
		if (parsed.success) {
			const { message, stack, path, kind } = parsed.data;
			await logSystemError({
				source: "dashboard",
				message,
				metadata: { stack, path, kind, userId: user.id },
			});
		}
	} catch {
		// Swallow — see comment above.
	}
	return c.body(null, 204);
});
