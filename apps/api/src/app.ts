import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { authRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { instanceRoute } from "./routes/instance";
import { instanceAuditLogsRoute } from "./routes/instance-audit-logs";
import { instanceInvitationsRoute } from "./routes/instance-invitations";
import { instanceServersRoute } from "./routes/instance-servers";
import { instanceSmtpRoute } from "./routes/instance-smtp";
import { instanceSshKeysRoute } from "./routes/instance-ssh-keys";
import { instanceUsersRoute } from "./routes/instance-users";
import { invitationsRoute } from "./routes/invitations";
import { onboardingRoute } from "./routes/onboarding";
import { organizationsRoute } from "./routes/organizations";
import { passkeyRoute } from "./routes/passkey";
import { passwordRoute } from "./routes/password";
import { projectsRoute } from "./routes/projects";
import { setupRoute } from "./routes/setup";
import { twoFactorRoute } from "./routes/two-factor";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

// Normalizes every unhandled error/404 into the same `{ error: string }`
// shape every route already returns by hand — see lib/errors.ts.
app.onError(errorHandler);
app.notFound(notFoundHandler);

// Same-origin only, no config needed — dashboard and api are always
// same-origin (via Caddy in prod, via Next.js rewrites in dev). See
// ARCHITECTURE.md's Authorization Model section.
app.use("*", csrf());

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
app.route("/instance/audit-logs", instanceAuditLogsRoute);
app.route("/organizations", organizationsRoute);
app.route("/organizations", projectsRoute);
app.route("/invitations", invitationsRoute);
app.route("/instance-invitations", instanceInvitationsRoute);
app.route("/onboarding", onboardingRoute);
