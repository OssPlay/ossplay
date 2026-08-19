import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { assetsRoute } from "./routes/assets";
import { authRoute } from "./routes/auth";
import { clientErrorsRoute } from "./routes/client-errors";
import { foldersRoute } from "./routes/folders";
import { healthRoute } from "./routes/health";
import { instanceRoute } from "./routes/instance";
import { instanceAuditLogsRoute } from "./routes/instance-audit-logs";
import { instanceComputeRoute } from "./routes/instance-compute";
import { instanceErrorLogsRoute } from "./routes/instance-error-logs";
import { instanceInvitationsRoute } from "./routes/instance-invitations";
import { instanceRemoteWorkersRoute } from "./routes/instance-remote-workers";
import { instanceServersRoute } from "./routes/instance-servers";
import { instanceSmtpRoute } from "./routes/instance-smtp";
import { instanceSshKeysRoute } from "./routes/instance-ssh-keys";
import { instanceUsersRoute } from "./routes/instance-users";
import { invitationsRoute } from "./routes/invitations";
import { notificationsRoute } from "./routes/notifications";
import { onboardingRoute } from "./routes/onboarding";
import { organizationsRoute } from "./routes/organizations";
import { passkeyRoute } from "./routes/passkey";
import { passwordRoute } from "./routes/password";
import { projectApiKeysRoute } from "./routes/project-api-keys";
import { projectsRoute } from "./routes/projects";
import { s3DestinationsRoute } from "./routes/s3-destinations";
import { setupRoute } from "./routes/setup";
import { twoFactorRoute } from "./routes/two-factor";
import { v1Route } from "./routes/v1";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

// Normalizes every unhandled error/404 into the same `{ error: string }`
// shape every route already returns by hand — see lib/errors.ts.
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Same-origin only, no config needed — dashboard and api are always
// same-origin (via Caddy in prod, via Next.js rewrites in dev). See
// ARCHITECTURE.md's Authorization Model section. Skipped for /v1/* — the
// public consumer API authenticates via a project-scoped API key
// (middleware/require-api-key.ts), never a cookie, so CSRF protection
// (which exists specifically to stop a browser's ambient cookie auth from
// being abused cross-origin) doesn't apply and would only break legitimate
// external callers.
app.use("*", async (c, next) => {
	if (c.req.path.startsWith("/v1/")) return next();
	return csrf()(c, next);
});

app.route("/health", healthRoute);
app.route("/setup", setupRoute);
app.route("/auth", authRoute);
app.route("/auth/2fa", twoFactorRoute);
app.route("/auth", passwordRoute);
app.route("/auth/passkey", passkeyRoute);
app.route("/instance", instanceRoute);
app.route("/instance/smtp", instanceSmtpRoute);
app.route("/instance/users", instanceUsersRoute);
app.route("/instance/ssh-keys", instanceSshKeysRoute);
app.route("/instance/servers", instanceServersRoute);
app.route("/instance/compute-destinations", instanceComputeRoute);
app.route("/instance/remote-workers", instanceRemoteWorkersRoute);
app.route("/instance/audit-logs", instanceAuditLogsRoute);
app.route("/instance/error-logs", instanceErrorLogsRoute);
app.route("/client-errors", clientErrorsRoute);
app.route("/organizations", organizationsRoute);
app.route("/organizations", projectsRoute);
app.route("/organizations", s3DestinationsRoute);
app.route("/organizations", foldersRoute);
app.route("/organizations", assetsRoute);
app.route("/organizations", projectApiKeysRoute);
app.route("/invitations", invitationsRoute);
app.route("/instance-invitations", instanceInvitationsRoute);
app.route("/notifications", notificationsRoute);
app.route("/onboarding", onboardingRoute);
// The public consumer API — see routes/v1.ts's own comment. Reachable
// externally at /api/v1/... through Caddy's strip-prefix rule
// (infra/caddy/Caddyfile).
app.route("/v1", v1Route);
